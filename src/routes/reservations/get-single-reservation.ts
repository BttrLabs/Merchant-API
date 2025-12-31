import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { reservationsTable } from '@/db/tables'
import { ReservationSchema } from '@/db/schemas'
import { eq } from 'drizzle-orm'
import { NotFoundError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for viewing reservations
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'get',
  path: '/{reservation_id}',
  summary: 'Get a reservation',
  description: 'Retrieves details of a specific stock reservation including the variant, quantity reserved, cart association, and expiration time. Requires admin authentication.',
  tags: ["Reservations"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      reservation_id: z.string().uuid().openapi({
        param: { name: 'reservation_id', in: 'path' },
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ReservationSchema
        },
      },
      description: 'Reservation details',
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
  
  const [reservation] = await db.select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, param.reservation_id));
  
  if (!reservation) {
    event.error = {
      type: 'NotFound',
      message: 'Reservation not found',
      reservation_id: param.reservation_id,
    };
    throw new NotFoundError("Reservation not found");
  }
  
  event.reservation = reservation;
  
  return c.json(ReservationSchema.parse(reservation), 200);
})

export default app;
