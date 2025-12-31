import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { inventoryTable } from '@/db/tables'
import { InventorySchema, PaginationQuerySchema, createPaginatedResponseSchema } from '@/db/schemas'
import { sql, desc } from 'drizzle-orm'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

const PaginatedInventorySchema = createPaginatedResponseSchema(InventorySchema);

const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'List all inventory',
  description: 'Retrieves a paginated list of all inventory records. Each record shows the stock quantity for a variant. Useful for monitoring stock levels across all products.',
  tags: ["Inventory"],
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedInventorySchema
        },
      },
      description: 'Paginated inventory list',
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
  
  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(inventoryTable);
  const total = countResult?.count ?? 0;
  
  // Get paginated inventory
  const inventory = await db.select()
    .from(inventoryTable)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(inventoryTable.created_at));
  
  const total_pages = Math.ceil(total / limit);
  
  const response = {
    data: InventorySchema.array().parse(inventory),
    pagination: {
      page,
      limit,
      total,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    },
  };
  
  event.inventory_count = inventory.length;
  event.total = total;
  
  return c.json(response, 200);
})

export default app;
