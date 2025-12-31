import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { reservationsTable } from '@/db/tables'
import { ReservationSchema, PaginationQuerySchema, createPaginatedResponseSchema } from '@/db/schemas'
import { adminAuth } from '@/middleware/admin-auth'
import { sql, desc } from 'drizzle-orm'

const app = createApp()

// Require admin auth for viewing reservations
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const PaginatedReservationsSchema = createPaginatedResponseSchema(ReservationSchema);

const route = createRoute({
  method: 'get',
  path: '/',
  summary: 'List all reservations',
  description: 'Retrieves a paginated list of all stock reservations. Reservations are created during checkout to hold inventory for customers. Expired reservations should be cleaned up periodically. Requires admin authentication.',
  tags: ["Reservations"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedReservationsSchema
        },
      },
      description: 'Paginated reservation list',
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
  
  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(reservationsTable);
  const total = countResult?.count ?? 0;
  
  // Get paginated reservations
  const reservations = await db.select()
    .from(reservationsTable)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(reservationsTable.created_at));
  
  const total_pages = Math.ceil(total / limit);
  
  const response = {
    data: ReservationSchema.array().parse(reservations),
    pagination: {
      page,
      limit,
      total,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    },
  };
  
  event.reservations_count = reservations.length;
  event.total = total;
  
  return c.json(response, 200);
})

export default app;
