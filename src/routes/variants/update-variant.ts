import { eq } from 'drizzle-orm';

import { z, createRoute } from '@hono/zod-openapi'

import { VariantSchema, UpdateVariantSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { variantsTable } from "@/db/tables"
import { NotFoundError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for updating variants
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

// PATCH /products/{product_slug}/variants/{variant_id}
const route = createRoute({
  method: 'patch',
  path: '/{product_slug}/variants/{variant_id}',
  summary: 'Update a variant',
  description: 'Updates an existing variant. Supports partial updates - only provided fields will be modified. Use this to change pricing, SKU, or attributes. Requires admin authentication.',
  tags: ["Variants"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      product_slug: z
        .string()
        .openapi({
          param: {
            name: 'product_slug',
            in: 'path',
          },
          example: 'classic-leather-wallet',
        }),
      variant_id: z
        .string()
        .uuid()
        .openapi({
          param: {
            name: 'variant_id',
            in: 'path',
          },
          example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateVariantSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VariantSchema
        },
      },
      description: 'Updated variant',
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

  const param = c.req.valid('param')
  event.param = param;
  
  const body = c.req.valid('json')
  event.body = body;
  
  const db = createDB(c.env.DATABASE_URL)
    
  // Verify product exists
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
  })
  
  if (!product) {
    event.error = {
      type: 'NotFound',
      message: 'Product not found',
      product_slug: param.product_slug,
    };
    throw new NotFoundError("Product not found")
  }
  
  event.product = product;
  
  // Verify variant exists
  const [existingVariant] = await db.select()
    .from(variantsTable)
    .where(eq(variantsTable.id, param.variant_id));
  
  if (!existingVariant) {
    event.error = {
      type: 'NotFound',
      message: 'Variant not found',
      variant_id: param.variant_id,
    };
    throw new NotFoundError("Variant not found")
  }
  
  // Update variant
  const [updatedVariant] = await db.update(variantsTable)
    .set(body)
    .where(eq(variantsTable.id, param.variant_id))
    .returning()
  
  if (!updatedVariant) {
    event.error = {
      type: 'AppError',
      message: 'Failed to update variant',
      variant_id: param.variant_id,
    };
    throw new AppError("Failed to update variant")
  }
  
  event.updated_variant = updatedVariant;

  return c.json(VariantSchema.parse(updatedVariant), 200);
})

export default app;
