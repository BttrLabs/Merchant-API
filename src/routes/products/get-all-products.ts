import { z, createRoute } from '@hono/zod-openapi'
import { ProductSchema, PaginationQuerySchema, PaginationMetaSchema, createPaginatedResponseSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { productsTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'
import { sql } from 'drizzle-orm'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

const PaginatedProductsSchema = createPaginatedResponseSchema(ProductSchema);

// GET /products
const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'List all products',
  description: 'Retrieves a paginated list of all products with their variants and images. Results are sorted by creation date (newest first).',
  tags: ["Products"],
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedProductsSchema
        },
      },
      description: 'A paginated list of products with variants and images',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Internal server error',
    },
  },
})

app.openapi(route, async (c) => {
  const event = c.get('event');

  const { page, limit } = c.req.valid('query');
  const offset = (page - 1) * limit;
  
  event.pagination = { page, limit, offset };

  const db = createDB(c.env.DATABASE_URL)
  
  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable);
  const total = countResult?.count ?? 0;
  
  // Get paginated products
  const products = await db.query.productsTable.findMany({
    with: {
      variants: true,
      images: true,
    },
    limit,
    offset,
    orderBy: (table, { desc }) => [desc(table.created_at)],
  });
  
  const total_pages = Math.ceil(total / limit);
  
  const response = {
    data: ProductSchema.array().parse(products),
    pagination: {
      page,
      limit,
      total,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    },
  };
  
  event.products_count = products.length;
  event.total = total;
  
  return c.json(response, 200);
})

export default app;
