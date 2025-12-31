import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { reservationsTable, inventoryTable } from '@/db/tables'
import { eq, sql } from 'drizzle-orm'
import { NotFoundError, AppError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for deleting reservations
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

export const SuccessSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'delete',
  path: '/{reservation_id}',
  summary: 'Cancel a reservation',
  description: 'Cancels a stock reservation and restores the reserved quantity back to available inventory. Use this to manually release held stock when a checkout is abandoned. Requires admin authentication.',
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
          schema: SuccessSchema
        },
      },
      description: 'Cancellation confirmation with stock restored',
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
  
  // Get reservation first
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
  
  // Delete reservation and restore stock in a transaction
  await db.transaction(async (tx) => {
    // Restore stock
    await tx
      .update(inventoryTable)
      .set({
        stock_quantity: sql`${inventoryTable.stock_quantity} + ${reservation.quantity}`,
      })
      .where(eq(inventoryTable.variant_id, reservation.variant_id));
    
    // Delete reservation
    await tx
      .delete(reservationsTable)
      .where(eq(reservationsTable.id, param.reservation_id));
  });
  
  event.deleted_reservation = reservation;
  
  return c.json({ message: `Reservation ${param.reservation_id} deleted and stock restored` }, 200);
})

export default app;
