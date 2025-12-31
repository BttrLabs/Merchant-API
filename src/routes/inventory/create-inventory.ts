import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { inventoryTable, variantsTable } from '@/db/tables'
import { InventorySchema, CreateInventorySchema } from '@/db/schemas'
import { eq } from 'drizzle-orm'
import { NotFoundError, BadRequestError, AppError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for inventory creation
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create inventory record',
  description: 'Creates an inventory record for a variant. Each variant can only have one inventory record. Must be created before the variant can be purchased. Requires admin authentication.',
  tags: ["Inventory"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateInventorySchema
        }
      }
    }
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: InventorySchema
        },
      },
      description: 'Created inventory record',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Bad Request',
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
  
  const body = c.req.valid('json');
  event.body = body;
  
  const db = createDB(c.env.DATABASE_URL);
  
  // Check if variant exists
  const [variant] = await db.select()
    .from(variantsTable)
    .where(eq(variantsTable.id, body.variant_id));
  
  if (!variant) {
    event.error = {
      type: 'NotFound',
      message: 'Variant not found',
      variant_id: body.variant_id,
    };
    throw new NotFoundError("Variant not found");
  }
  
  // Check if inventory already exists for this variant
  const [existing] = await db.select()
    .from(inventoryTable)
    .where(eq(inventoryTable.variant_id, body.variant_id));
  
  if (existing) {
    event.error = {
      type: 'BadRequest',
      message: 'Inventory already exists for this variant',
      variant_id: body.variant_id,
    };
    throw new BadRequestError("Inventory already exists for this variant");
  }
  
  const [inventory] = await db.insert(inventoryTable)
    .values({
      variant_id: body.variant_id,
      stock_quantity: body.stock_quantity,
    })
    .returning();
  
  if (!inventory) {
    event.error = {
      type: 'AppError',
      message: 'Failed to create inventory',
      variant_id: body.variant_id,
    };
    throw new AppError("Failed to create inventory");
  }
  
  event.created_inventory = inventory;
  
  return c.json(InventorySchema.parse(inventory), 201);
})

export default app;
