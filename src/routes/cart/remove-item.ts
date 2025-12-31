import { eq, and } from 'drizzle-orm';

import { z, createRoute } from '@hono/zod-openapi'

import { UnauthorizedError, NotFoundError, BadRequestError, AppError } from "@/errors"

import { createDB } from "@/db/client"
import { cartsItemsTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const SuccessSchema = z.object({
  message: z.string(),
});

export const ErrorSchema = z.object({
  message: z.string(),
});

// POST /cart/items
const route = createRoute({
  method: 'delete',
  path: '/items/{cart_item_id}',
  summary: 'Remove item from cart',
  description: 'Removes an item from the cart entirely. The cart item must belong to the current session. Requires X-Session-ID header.',
  tags: ["Cart"],
  request: {
    params: z.object({
      cart_item_id: z
        .string()
        .uuid()
        .openapi({
          param: {
            name: 'cart_item_id',
            in: 'path',
          },
          example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        }),
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessSchema
        },
      },
      description: 'Removal confirmation',
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
  
  const param = c.req.valid('param');
  event.param = param;
  
  const sessionId = c.req.header('X-Session-ID');
  event.sessionId = sessionId;
  
  if (!sessionId) {
    event.error = {
      type: 'UnauthorizedError',
      message: 'X-Session-ID required',
    };
    throw new UnauthorizedError("X-Session-ID required")
  };

  const db = createDB(c.env.DATABASE_URL);

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
  });

  if (!cart) {
    event.error = {
      type: 'NotFound',
      message: 'Cart not found',
      session_id: sessionId,
    };
    throw new NotFoundError('Cart not found')
  }
  event.cart = cart;
  
  const now = new Date();
  
  if (cart.expires_at <= now) {
    event.error = {
      type: 'BadRequest',
      message: 'Cart has expired',
      session_id: sessionId,
    };
    throw new BadRequestError('Cart has expired')
  }

  // Verify that cart item exists
  const [cart_item] = await db
    .select()
    .from(cartsItemsTable)
    .where(and(eq(cartsItemsTable.id, param.cart_item_id), eq(cartsItemsTable.cart_id, cart.id)))

  if (!cart_item) {
    event.error = {
      type: 'NotFound',
      message: 'Cart item not found',
      cart_id: cart.id,
      cart_item_id: param.cart_item_id,
    };
    throw new NotFoundError("Cart item not found")
  }
  
  event.cart_item = cart_item;

  const [deleted_cart_item] = await db.delete(cartsItemsTable)
    .where(eq(cartsItemsTable.id, cart_item.id))
    .returning();
  
  if (!deleted_cart_item) {
    event.error = {
      type: 'DeletionFailed',
      message: 'Cart item deletion failed',
      cart_item_id: cart_item.id,
    };
    throw new AppError("Cart item deletion failed");
  };
  
  event.deleted_cart_item = deleted_cart_item;

  return c.json({ message: `Cart Item with id ${deleted_cart_item.id} was removed` }, 200);
})


export default app;