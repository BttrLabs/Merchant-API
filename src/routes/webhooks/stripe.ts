import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { ordersTable, orderItemsTable, paymentsTable, cartsTable } from '@/db/tables'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { clearReservations, restoreStockFromReservations } from '@/lib/inventory'
import { encrypt } from '@/lib/crypto'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'post',
  path: '/',
  summary: 'Stripe Webhook',
  description: 'Handle Stripe webhook events for checkout sessions.',
  tags: ["Webhooks"],
  responses: {
    200: {
      description: 'Webhook processed successfully',
      content: {
        'application/json': {
          schema: z.object({
            received: z.boolean()
          })
        }
      }
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Invalid webhook payload',
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
  
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY)
  const db = createDB(c.env.DATABASE_URL)
  
  // Get the raw body for signature verification
  const rawBody = await c.req.text()
  const signature = c.req.header('stripe-signature')
  
  if (!signature) {
    event.error = { type: 'BadRequest', message: 'Missing stripe-signature header' }
    return c.json({ message: 'Missing stripe-signature header' }, 400)
  }
  
  let stripeEvent: Stripe.Event
  
  // Debug: Check if secret is configured
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    event.error = { type: 'ConfigError', message: 'STRIPE_WEBHOOK_SECRET not configured' }
    return c.json({ message: 'Webhook secret not configured' }, 500)
  }
  
  event.debug = {
    signature_present: !!signature,
    signature_prefix: signature?.substring(0, 20),
    secret_prefix: webhookSecret.substring(0, 10),
    body_length: rawBody.length,
  }
  
  try {
    stripeEvent = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret
    )
  } catch (err) {
    const error = err as Error
    event.error = { 
      type: 'BadRequest', 
      message: 'Invalid webhook signature', 
      error_message: error.message,
    }
    return c.json({ message: 'Invalid webhook signature', detail: error.message }, 400)
  }
  
  event.stripe_event_type = stripeEvent.type
  event.stripe_event_id = stripeEvent.id
  
  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      await handleCheckoutCompleted(db, session, event, c.env.ENCRYPTION_KEY)
      break
    }
    
    case 'checkout.session.expired': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session
      await handleCheckoutExpired(db, session, event)
      break
    }
    
    default:
      event.unhandled_event = stripeEvent.type
  }
  
  return c.json({ received: true }, 200)
})

async function handleCheckoutCompleted(
  db: ReturnType<typeof createDB>,
  session: Stripe.Checkout.Session,
  event: Record<string, any>,
  encryptionKey: string
) {
  const checkoutSessionId = session.id
  const cartId = session.metadata?.cart_id
  
  event.checkout_session_id = checkoutSessionId
  event.cart_id = cartId
  
  if (!cartId) {
    event.error = { type: 'BadRequest', message: 'Missing cart_id in session metadata' }
    return
  }
  
  // Find the order by checkout session ID
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.stripe_checkout_session_id, checkoutSessionId),
  })
  
  if (!order) {
    event.error = { type: 'NotFound', message: 'Order not found', checkout_session_id: checkoutSessionId }
    return
  }
  
  event.order_id = order.id
  
  // Get cart with items to create order items
  const cart = await db.query.cartsTable.findFirst({
    where: eq(cartsTable.id, cartId),
    with: {
      items: {
        with: {
          variant: true
        }
      }
    }
  })
  
  if (!cart) {
    event.error = { type: 'NotFound', message: 'Cart not found', cart_id: cartId }
    return
  }
  
  // Extract customer info directly from webhook payload
  const customerDetails = session.customer_details
  
  // Shipping details are in collected_information for API version 2025-04-30
  const collectedInfo = (session as any).collected_information
  const shippingDetails = collectedInfo?.shipping_details ?? null
  
  // Calculate totals
  const subtotal = session.amount_subtotal ? (session.amount_subtotal / 100).toFixed(2) : null
  const total = session.amount_total ? (session.amount_total / 100).toFixed(2) : null
  const shippingCost = session.shipping_cost?.amount_total 
    ? (session.shipping_cost.amount_total / 100).toFixed(2) 
    : null
  
  // Encrypt PII fields for DSGVO/GDPR compliance
  const encryptField = async (value: string | null | undefined): Promise<string | null> => {
    if (!value) return null
    return encrypt(value, encryptionKey)
  }
  
  // Update order with encrypted customer info, shipping, and totals
  await db.update(ordersTable)
    .set({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent as string | null,
      email: await encryptField(customerDetails?.email),
      customer_name: await encryptField(customerDetails?.name),
      shipping_name: await encryptField(shippingDetails?.name),
      shipping_address_line1: await encryptField(shippingDetails?.address?.line1),
      shipping_address_line2: await encryptField(shippingDetails?.address?.line2),
      shipping_city: await encryptField(shippingDetails?.address?.city),
      shipping_state: await encryptField(shippingDetails?.address?.state),
      shipping_postal_code: await encryptField(shippingDetails?.address?.postal_code),
      shipping_country: await encryptField(shippingDetails?.address?.country),
      subtotal,
      total,
      shipping_cost: shippingCost,
      currency: session.currency ?? 'eur',
    })
    .where(eq(ordersTable.id, order.id))
  
  event.order_updated = true
  
  // Create order items from cart items
  const orderItems = cart.items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    unit_price: item.variant.price,
    currency: item.variant.currency ?? 'eur',
  }))
  
  if (orderItems.length > 0) {
    await db.insert(orderItemsTable).values(orderItems)
    event.order_items_created = orderItems.length
  }
  
  // Create payment record
  if (session.payment_intent) {
    await db.insert(paymentsTable).values({
      order_id: order.id,
      status: 'succeeded',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: total ?? '0',
      currency: session.currency ?? 'eur',
    })
    event.payment_created = true
  }
  
  // Clear reservations (stock already deducted, payment confirmed)
  await clearReservations(db, cartId)
  event.reservations_cleared = true
}

async function handleCheckoutExpired(
  db: ReturnType<typeof createDB>,
  session: Stripe.Checkout.Session,
  event: Record<string, any>
) {
  const checkoutSessionId = session.id
  const cartId = session.metadata?.cart_id
  
  event.checkout_session_id = checkoutSessionId
  event.cart_id = cartId
  
  if (!cartId) {
    event.error = { type: 'BadRequest', message: 'Missing cart_id in session metadata' }
    return
  }
  
  // Find the order by checkout session ID
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.stripe_checkout_session_id, checkoutSessionId),
  })
  
  if (order) {
    // Update order status to failed
    await db.update(ordersTable)
      .set({ status: 'failed' })
      .where(eq(ordersTable.id, order.id))
    
    event.order_id = order.id
    event.order_status_updated = 'failed'
  }
  
  // Restore stock from reservations
  await restoreStockFromReservations(db, cartId)
  event.stock_restored = true
  
  // Update cart status to abandoned
  await db.update(cartsTable)
    .set({ status: 'abandoned' })
    .where(eq(cartsTable.id, cartId))
  
  event.cart_status_updated = 'abandoned'
}

export default app
