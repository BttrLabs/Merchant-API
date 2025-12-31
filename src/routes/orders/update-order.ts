import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { ordersTable } from '@/db/tables'
import { OrderSchema, UpdateOrderSchema } from '@/db/schemas'
import { eq } from 'drizzle-orm'
import { NotFoundError, AppError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'
import { encryptPII, decryptPII } from '@/lib/crypto'

const app = createApp()

// Require admin auth for updating orders
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'patch',
  path: '/{order_id}',
  summary: 'Update an order',
  description: 'Updates order status or customer details. PII fields are automatically encrypted before storage and decrypted in the response. Status transitions should follow the order lifecycle. Requires admin authentication.',
  tags: ["Orders"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      order_id: z.string().uuid().openapi({
        param: { name: 'order_id', in: 'path' },
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateOrderSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: OrderSchema
        },
      },
      description: 'Updated order with decrypted PII',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Forbidden - Invalid or missing API key',
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
  
  const param = c.req.valid('param');
  event.param = param;
  
  const body = c.req.valid('json');
  event.body = { ...body, email: body.email ? '[REDACTED]' : undefined };
  
  const db = createDB(c.env.DATABASE_URL);
  const encryptionKey = c.env.ENCRYPTION_KEY;
  
  // Check if order exists
  const existingOrder = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, param.order_id),
  });
  
  if (!existingOrder) {
    event.error = {
      type: 'NotFound',
      message: 'Order not found',
      order_id: param.order_id,
    };
    throw new NotFoundError("Order not found");
  }
  
  // Encrypt any PII fields in the update body
  const encryptedBody = await encryptPII(body, encryptionKey);
  
  // Update order
  const [updatedOrder] = await db.update(ordersTable)
    .set(encryptedBody)
    .where(eq(ordersTable.id, param.order_id))
    .returning();
  
  if (!updatedOrder) {
    event.error = {
      type: 'AppError',
      message: 'Failed to update order',
      order_id: param.order_id,
    };
    throw new AppError("Failed to update order");
  }
  
  // Fetch with relations
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, param.order_id),
    with: {
      items: true,
    },
  });
  
  if (!order) {
    throw new AppError("Failed to fetch updated order");
  }
  
  // Decrypt PII for response
  const decryptedOrder = await decryptPII(order, encryptionKey);
  
  event.updated_order = { id: decryptedOrder.id, status: decryptedOrder.status };
  
  return c.json(OrderSchema.parse(decryptedOrder), 200);
})

export default app;
