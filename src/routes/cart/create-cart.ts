import { eq } from 'drizzle-orm';

import { z, createRoute } from '@hono/zod-openapi'

import { AppError } from "@/errors"

import { CartSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { cartsTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

const CartResponseSchema = CartSchema.omit({ id: true, items: true });

// POST /cart
const route = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create a cart',
  description: 'Creates a new shopping cart or returns an existing one. If an X-Session-ID header is provided and a cart exists for that session, returns the existing cart. Otherwise, creates a new cart and returns a new session ID in the response header.',
  tags: ["Cart"],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CartResponseSchema
        },
      },
      description: 'Cart created or retrieved',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Not Found',
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

  const db = createDB(c.env.DATABASE_URL);
  
  // Get session ID from header (or generate new one)
  let sessionId = c.req.header('X-Session-ID');
  
  if (!sessionId) {
    // Generate new session ID if not provided
    sessionId = crypto.randomUUID()
  };
  
  event.session_id = sessionId;
  
  const existingCart = await db.query.cartsTable.findFirst({
    where: eq(cartsTable.session_id, sessionId)
  });
  
  if (existingCart) {
    // Return existing cart
    event.existing_cart = existingCart;
    c.header('X-Session-ID', sessionId);
    return c.json(CartResponseSchema.parse(existingCart), 200);
  };
    
  // Create new empty cart with session_id
  const [cart] = await db.insert(cartsTable)
    .values({ session_id: sessionId })
    .returning();
    
  // Verify that cart was created
  if (!cart) {
    event.error = {
      type: 'InsertionFailed',
      message: 'Cart inserting failed',
      session_id: sessionId
    };
    throw new AppError("Cart creation failed");
  };
  
  event.cart = cart;

  // Return session ID in response header so client can store it
  c.header('X-Session-ID', sessionId);

  return c.json(CartResponseSchema.parse(cart), 200);
})

export default app;