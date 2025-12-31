import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'
import { inventoryTable } from '@/db/tables'
import { InventorySchema, UpdateInventorySchema } from '@/db/schemas'
import { eq, sql, and, gte } from 'drizzle-orm'
import { NotFoundError, BadRequestError, AppError } from "@/errors"
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for inventory updates
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

const route = createRoute({
  method: 'patch',
  path: '/{variant_id}',
  summary: 'Update inventory',
  description: 'Updates stock quantity for a variant. Use stock_quantity to set an absolute value, or adjust for relative changes (+/-). Negative adjustments that would result in negative stock will fail. Requires admin authentication.',
  tags: ["Inventory"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      variant_id: z.string().uuid().openapi({
        param: { name: 'variant_id', in: 'path' },
        example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateInventorySchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: InventorySchema
        },
      },
      description: 'Updated inventory record',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Bad Request - Would result in negative stock',
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
  event.body = body;
  
  const db = createDB(c.env.DATABASE_URL);
  
  // Check if inventory exists
  const [existing] = await db.select()
    .from(inventoryTable)
    .where(eq(inventoryTable.variant_id, param.variant_id));
  
  if (!existing) {
    event.error = {
      type: 'NotFound',
      message: 'Inventory not found',
      variant_id: param.variant_id,
    };
    throw new NotFoundError("Inventory not found");
  }
  
  // Handle absolute stock_quantity update
  if (body.stock_quantity !== undefined) {
    // Validation already handled by schema (min: 0)
    const [updated] = await db.update(inventoryTable)
      .set({ stock_quantity: body.stock_quantity })
      .where(eq(inventoryTable.variant_id, param.variant_id))
      .returning();
    
    if (!updated) {
      throw new AppError("Failed to update inventory");
    }
    
    event.updated_inventory = updated;
    return c.json(InventorySchema.parse(updated), 200);
  }
  
  // Handle relative adjust - must prevent negative stock
  if (body.adjust !== undefined) {
    // For negative adjustments, check if result would be negative
    if (body.adjust < 0) {
      const requiredStock = Math.abs(body.adjust);
      
      // Use atomic update with check to prevent race conditions
      const [updated] = await db.update(inventoryTable)
        .set({ stock_quantity: sql`${inventoryTable.stock_quantity} + ${body.adjust}` })
        .where(
          and(
            eq(inventoryTable.variant_id, param.variant_id),
            gte(inventoryTable.stock_quantity, requiredStock)
          )
        )
        .returning();
      
      if (!updated) {
        event.error = {
          type: 'BadRequest',
          message: 'Insufficient stock for adjustment',
          current_stock: existing.stock_quantity,
          requested_adjustment: body.adjust,
        };
        throw new BadRequestError(`Insufficient stock. Current: ${existing.stock_quantity}, Adjustment: ${body.adjust}`);
      }
      
      event.updated_inventory = updated;
      return c.json(InventorySchema.parse(updated), 200);
    }
    
    // Positive adjustment - no check needed
    const [updated] = await db.update(inventoryTable)
      .set({ stock_quantity: sql`${inventoryTable.stock_quantity} + ${body.adjust}` })
      .where(eq(inventoryTable.variant_id, param.variant_id))
      .returning();
    
    if (!updated) {
      throw new AppError("Failed to update inventory");
    }
    
    event.updated_inventory = updated;
    return c.json(InventorySchema.parse(updated), 200);
  }
  
  throw new AppError('Either stock_quantity or adjust must be provided');
})

export default app;
