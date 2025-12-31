import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { inventoryTable } from '@/db/tables'
import { InventorySchema } from '@/db/schemas'
import { eq } from 'drizzle-orm'
import { NotFoundError } from "@/errors"
import { getReservedQuantity } from '@/lib/inventory'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

const InventoryResponseSchema = InventorySchema.extend({
  reserved_quantity: z.number().int(),
  available: z.number().int(),
});

const route = createRoute({
  method: 'get',
  path: '/{variant_id}',
  summary: 'Get variant inventory',
  description: 'Retrieves inventory details for a specific variant including total stock, reserved quantity (from active checkouts), and available quantity for purchase.',
  tags: ["Inventory"],
  request: {
    params: z.object({
      variant_id: z.string().uuid().openapi({
        param: { name: 'variant_id', in: 'path' },
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: InventoryResponseSchema
        },
      },
      description: 'Inventory details with availability',
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
  
  const [inventory] = await db.select()
    .from(inventoryTable)
    .where(eq(inventoryTable.variant_id, param.variant_id));
  
  if (!inventory) {
    event.error = {
      type: 'NotFound',
      message: 'Inventory not found',
      variant_id: param.variant_id,
    };
    throw new NotFoundError("Inventory not found");
  }
  
  const reserved_quantity = await getReservedQuantity(db, param.variant_id);
  
  event.inventory = inventory;
  event.reserved_quantity = reserved_quantity;
  
  const response = {
    ...inventory,
    reserved_quantity,
    available: inventory.stock_quantity - reserved_quantity,
  };
  
  return c.json(InventoryResponseSchema.parse(response), 200);
})

export default app;
