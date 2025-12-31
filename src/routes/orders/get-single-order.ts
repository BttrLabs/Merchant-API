import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { ordersTable } from '@/db/tables'
import { OrderSchema } from '@/db/schemas'
import { eq } from 'drizzle-orm'
import { NotFoundError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'
import { decryptPII } from '@/lib/crypto'

const app = createApp()

// Require admin auth for viewing orders (contains PII)
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'get',
  path: '/{order_id}',
  summary: 'Get an order',
  description: 'Retrieves a specific order with all its items. Customer PII (email, name, address) is decrypted in the response. Requires admin authentication.',
  tags: ["Orders"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      order_id: z.string().uuid().openapi({
        param: { name: 'order_id', in: 'path' },
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: OrderSchema
        },
      },
      description: 'Order details with decrypted PII',
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
  
  const db = createDB(c.env.DATABASE_URL);
  const encryptionKey = c.env.ENCRYPTION_KEY;
  
  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, param.order_id),
    with: {
      items: true,
    },
  });
  
  if (!order) {
    event.error = {
      type: 'NotFound',
      message: 'Order not found',
      order_id: param.order_id,
    };
    throw new NotFoundError("Order not found");
  }
  
  // Decrypt PII fields
  const decryptedOrder = await decryptPII(order, encryptionKey);
  
  event.order = { id: decryptedOrder.id, status: decryptedOrder.status };
  
  return c.json(OrderSchema.parse(decryptedOrder), 200);
})

export default app;
