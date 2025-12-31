import { z, createRoute } from '@hono/zod-openapi'

import { UnauthorizedError, NotFoundError, BadRequestError } from "@/errors"

import { CartSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /cart
const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'Get current cart',
  description: 'Retrieves the cart for the current session. Requires X-Session-ID header. Returns the cart with all items, including product and variant details. Returns 404 if no cart exists for the session.',
  tags: ["Cart"],
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CartSchema
        },
      },
      description: 'Cart with items',
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
  
  // Get the cart with the items - verify session ownership
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
  });
  
  if (!cart) {
    event.error = {
      type: 'NotFound',
      message: 'Cart not found',
      session_id: sessionId,
    };
    throw new NotFoundError('Cart not found')
  }
  
  const now = new Date();
  
  if (cart.expires_at <= now) {
    event.error = {
      type: 'BadRequest',
      message: 'Cart has expired',
      session_id: sessionId,
    };
    throw new BadRequestError('Cart has expired')
  }
  
  event.cart = cart;
  
  return c.json(CartSchema.parse(cart), 200);
})

export default app;