import { eq, and } from 'drizzle-orm';
import { z, createRoute } from '@hono/zod-openapi'

import { UnauthorizedError, NotFoundError, BadRequestError, AppError } from "@/errors"

import { CartSchema, CreateCartItemSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { cartsItemsTable, variantsTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// POST /cart/{cart_items}/items
const route = createRoute({
  method: 'post',
  path: '/items',
  summary: 'Add item to cart',
  description: 'Adds a product variant to the cart with the specified quantity. If the variant already exists in the cart, increments the quantity. Validates against max quantity limits and returns the updated cart. Requires X-Session-ID header.',
  tags: ["Cart"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateCartItemSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CartSchema
        },
      },
      description: 'Updated cart with added item',
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
  event.body = body;
  
  const sessionId = c.req.header('X-Session-ID')
  event.sessionId = sessionId;
  
  if (!sessionId) {
    event.error = {
      type: 'UnauthorizedError',
      message: 'X-Session-ID required',
    };
    throw new UnauthorizedError("X-Session-ID required")
  }
  
  const db = createDB(c.env.DATABASE_URL)

  // Verify that cart exists and belongs to this session
  const cart = await db.query.cartsTable.findFirst({
    where: (table, { eq }) => eq(table.session_id, sessionId),
    with: {
      items: {
        with: {
          product: true,
          variant: true,
        },
      },
    },
  })

  if (!cart) {
    event.error = {
      type: 'NotFound',
      message: 'Cart not found',
      session_id: sessionId,
    };
    throw new NotFoundError("Cart not found")
  };
  
  event.cart = cart;
  
  const now = new Date();
  
  if (cart.expires_at <= now) {
    event.error = {
      type: 'BadRequest',
      message: 'Cart has expired',
      session_id: sessionId,
    };
    throw new BadRequestError("Cart has expired")
  }

  // Verify that variant exists
  const [variant] = await db
    .select()
    .from(variantsTable)
    .where(eq(variantsTable.id, body.variant_id))

  if (!variant) {
    event.error = {
      type: 'NotFound',
      message: 'Variant not found',
      session_id: sessionId,
    };
    throw new NotFoundError("Variant not found")
  }
  
  event.variant = variant;

  // Check if item already exists in the cart
  const [existingItem] = await db
    .select()
    .from(cartsItemsTable)
    .where(and(eq(cartsItemsTable.cart_id, cart.id), eq(cartsItemsTable.variant_id, variant.id)))
  
  event.existing_item = existingItem;
  
  const new_quantity = existingItem ? existingItem.quantity + body.quantity : body.quantity
  event.new_quantity = new_quantity;


  // Check if new quantity would exceed the max quantity
  // If yes: return the old cart
  // If no: continue
  if (variant.max_quantity && new_quantity > variant.max_quantity) {
    event.error = {
      type: 'MaxQuantity',
      message: 'New quantity would exceed max quantity',
      session_id: sessionId,
    };
    const parsedCart = CartSchema.parse(cart)
    return c.json(parsedCart, 200)
  }

  if (existingItem) {
    const [updatedItem] = await db.update(cartsItemsTable)
      .set({ quantity: new_quantity })
      .where(eq(cartsItemsTable.id, existingItem.id))
      .returning();
    
    if (!updatedItem) {
      event.error = {
        type: 'UpdateFailed',
        message: 'Failed to update cart item quantity',
        cart_item_id: existingItem.id,
      };
      throw new AppError("Failed to update cart item quantity")
    }
  } else {
    const [cartItem] = await db.insert(cartsItemsTable)
      .values({
        cart_id: cart.id,
        product_id: variant.product_id,
        variant_id: variant.id,
        quantity: body.quantity,
        currency: variant.currency,
      }).returning();
    
    if (!cartItem) {
      event.error = {
        type: 'InsertionFailed',
        message: 'Failed to insert cart item',
        session_id: sessionId,
      };
      
      throw new AppError("Failed to insert cart item")
    }
  }

  // Return updated cart
  const updatedCart = await db.query.cartsTable.findFirst({
    where: (table, { eq }) => eq(table.session_id, sessionId),
    with: {
      items: {
        with: {
          product: true,
          variant: true,
        },
      },
    },
  })
  
  if (!updatedCart) {
    event.error = {
      type: 'NotFound',
      message: 'Cart not found after update',
      session_id: sessionId,
    };
    throw new AppError("Cart not found after update")
  }
  
  event.updated_cart = updatedCart;

  return c.json(CartSchema.parse(updatedCart), 200)
})


export default app;