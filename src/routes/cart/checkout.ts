import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { cartsTable, inventoryTable, ordersTable } from '@/db/tables'
import { eq, sql, inArray } from 'drizzle-orm'
import Stripe from 'stripe'
import { UnauthorizedError, NotFoundError, BadRequestError, AppError } from "@/errors"
import { reserveStock, restoreStockFromReservations } from '@/lib/inventory'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /checkout
const route = createRoute({
  method: 'post',
  path: '/checkout',
  summary: 'Start checkout',
  description: 'Initiates the Stripe Checkout flow for the current cart. Validates stock availability, reserves inventory for 30 minutes, and creates a Stripe Checkout session. Returns a redirect URL to complete payment. Requires X-Session-ID header.',
  tags: ["Cart"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            success_url: z.string().url().min(1, "Success url is required").openapi({ example: 'https://example.com/success' }),
            cancel_url: z.string().url().min(1, "Cancel url is required").openapi({ example: 'https://example.com/cancel' }),
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Stripe Checkout session created',
      content: {
        'application/json': {
          schema: z.object({
            checkout_url: z.string().url(),
            session_id: z.string()
          })
        }
      }
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Not Found',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Bad Request',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Internal Server Error',
    },
  },
})

app.openapi(route, async (c) => {
  const event = c.get('event');

  const body = c.req.valid('json');
  event.body = body
  
  const sessionId = c.req.header('x-session-id')
  if (!sessionId) {
    throw new UnauthorizedError('Session ID required')
  }
  event.sessionId = sessionId
  
  const db = createDB(c.env.DATABASE_URL)
  
  // 1. Get cart with items
  const cart = await db.query.cartsTable.findFirst({
    where: eq(cartsTable.session_id, sessionId),
    with: {
      items: {
        with: {
          variant: {
            with: {
              product: true
            }
          }
        }
      }
    }
  })
  
  event.cart = cart;
  
  // Verify cart is not empty
  if (!cart || cart.items.length === 0) {
    event.error = {
      type: 'BadRequest',
      message: 'Cart is empty',
    };
    throw new BadRequestError('Cart is empty');
  }
  
  // Check cart expiration
  if (cart.expires_at < new Date()) {
    event.error = {
      type: 'BadRequest',
      message: 'Cart has expired',
      expires_at: cart.expires_at,
    };
    throw new BadRequestError('Cart has expired')
  }
  
  // Reset expiration when checkout starts so it doesn't expire mid-checkout
  await db.update(cartsTable).set({ expires_at: sql`now() + interval '30 minutes'` }).where(eq(cartsTable.id, cart.id))
  
  if (cart.status !== 'active') {
    event.error = {
      type: 'BadRequest',
      message: 'Cart already checked out',
    };
    throw new BadRequestError('Cart already checked out')
  }
  
  // Check stock inventory for variants
  const inventory = await db
    .select()
    .from(inventoryTable)
    .where(
      inArray(
        inventoryTable.variant_id,
        cart.items.map((item) => item.variant_id)
      )
    )
  const inventoryMap = new Map(inventory.map((inv) => [inv.variant_id, inv.stock_quantity]))
  const stockErrors = cart.items
    .filter((item) => (inventoryMap.get(item.variant_id) ?? 0) < item.quantity)
    .map((item) => ({
      variant_id: item.variant_id,
      product_name: item.variant.product.title,
      variant_name: item.variant.title,
      requested: item.quantity,
      available: inventoryMap.get(item.variant_id) ?? 0
    }))
  if (stockErrors.length > 0) {
    event.error = {
      type: 'BadRequest',
      message: 'Insufficient stock',
      items: stockErrors
    };
    throw new BadRequestError('Insufficient stock');
  }
  
  // Reserve stock with expiration (30 minutes from now)
  const reservationExpiry = new Date(Date.now() + 30 * 60 * 1000)
  const reserveResult = await reserveStock(db, cart.id, cart.items, reservationExpiry)
  if (!reserveResult.success) {
    event.error = {
      type: 'BadRequest',
      message: 'Stock changed, please try again',
      variant_id: reserveResult.failed_variant_id
    }
    throw new BadRequestError('Stock changed, please try again')
  }
  
  // Stripe Checkout Flow
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)
  
  // Create Stripe Shipping Options
  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: 'eur' },
        display_name: 'Standard Shipping',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 5 },
          maximum: { unit: 'business_day', value: 7 },
        },
      },
    },
  ];
  
  event.shipping_options = shippingOptions;
  
  // Create Stripe Checkout Items
  const lineItems = cart.items.map((item) => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: item.variant.product.title,
        description: item.variant.option,
      },
      unit_amount: Math.round(Number(item.variant.price) * 100),
    },
    quantity: item.quantity,
  }))
  
  event.line_items = lineItems;

  
  // Create Stripe Checkout Session
  let checkoutSession: Stripe.Checkout.Session
  
  try {
    checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      metadata: {
        cart_id: cart.id,
        session_id: sessionId
      },
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['DE', 'AT', 'CH']
      },
      shipping_options: shippingOptions,
      customer_creation: 'always',
      phone_number_collection: {
        enabled: true
      }
    })
  } catch (error) {
    await restoreStockFromReservations(db, cart.id)
    throw new AppError('Failed to create checkout session')
  }
  
  event.checkout_session = checkoutSession;
  
  // Verify checkout url is provided
  if (!checkoutSession.url) {
    await restoreStockFromReservations(db, cart.id)
    throw new AppError('Checkout creating failed');
  }
  
  const [updatedCart] = await db
    .update(cartsTable)
    .set({ status: 'ordered' })
    .where(eq(cartsTable.id, cart.id))
    .returning()
  if (!updatedCart) {
    await restoreStockFromReservations(db, cart.id)
    event.error = {
      type: 'InsertionError',
      message: 'Failed to create order',
      data: {
        status: 'ordered'
      }
    }
    throw new AppError('Failed to update cart status')
  }
  
  const [order] = await db.insert(ordersTable).values({
    cart_id: cart.id,
    stripe_checkout_session_id: checkoutSession.id,
    status: 'pending'
  }).returning()
  if (!order) {
    await restoreStockFromReservations(db, cart.id)
    event.error = {
      type: 'InsertionError',
      message: 'Failed to create order',
      data: {
        cart_id: cart.id,
        stripe_checkout_session_id: checkoutSession.id,
        status: 'pending'
      }
    }
    throw new AppError('Something went wrong')
  }
  
  return c.json({
    checkout_url: checkoutSession.url,
    session_id: checkoutSession.id
  }, 200)
})

export default app;