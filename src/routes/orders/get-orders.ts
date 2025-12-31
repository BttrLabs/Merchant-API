import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { ordersTable } from '@/db/tables'
import { OrderSchema, PaginationQuerySchema, createPaginatedResponseSchema } from '@/db/schemas'
import { adminAuth } from '@/middleware/admin-auth'
import { decryptPII } from '@/lib/crypto'
import { sql, desc } from 'drizzle-orm'

const app = createApp()

// Require admin auth for viewing orders (contains PII)
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const PaginatedOrdersSchema = createPaginatedResponseSchema(OrderSchema);

const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'List all orders',
  description: 'Retrieves a paginated list of all orders with their items. Customer PII (email, name, address) is decrypted in the response. Sorted by creation date (newest first). Requires admin authentication.',
  tags: ["Orders"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedOrdersSchema
        },
      },
      description: 'Paginated order list with decrypted PII',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Forbidden - Invalid or missing API key',
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
  
  const { page, limit } = c.req.valid('query');
  const offset = (page - 1) * limit;
  
  event.pagination = { page, limit, offset };
  
  const db = createDB(c.env.DATABASE_URL);
  const encryptionKey = c.env.ENCRYPTION_KEY;
  
  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(ordersTable);
  const total = countResult?.count ?? 0;
  
  // Get paginated orders
  const orders = await db.query.ordersTable.findMany({
    with: {
      items: true,
    },
    limit,
    offset,
    orderBy: (table, { desc }) => [desc(table.created_at)],
  });
  
  // Decrypt PII fields for each order
  const decryptedOrders = await Promise.all(
    orders.map(async (order) => decryptPII(order, encryptionKey))
  );
  
  const total_pages = Math.ceil(total / limit);
  
  const response = {
    data: OrderSchema.array().parse(decryptedOrders),
    pagination: {
      page,
      limit,
      total,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    },
  };
  
  event.orders_count = decryptedOrders.length;
  event.total = total;
  
  return c.json(response, 200);
})

export default app;
