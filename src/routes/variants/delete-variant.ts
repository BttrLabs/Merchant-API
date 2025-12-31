import { eq } from 'drizzle-orm';

import { z, createRoute } from '@hono/zod-openapi'

import { createDB } from "@/db/client"
import { variantsTable } from "@/db/tables"
import { NotFoundError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for deleting variants
app.use('*', adminAuth)

export const SuccessSchema = z.object({
  message: z.string(),
});

export const ErrorSchema = z.object({
  message: z.string(),
});

// DELETE /products/{product_slug}/variants/{variant_id}
const route = createRoute({
  method: 'delete',
  path: '/{product_slug}/variants/{variant_id}',
  summary: 'Delete a variant',
  description: 'Permanently deletes a variant. This will also remove any associated inventory records. Cannot delete variants that have active reservations or are part of pending orders. Requires admin authentication.',
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
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SuccessSchema
        },
      },
      description: 'Deletion confirmation',
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

  const db = createDB(c.env.DATABASE_URL)
    
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
    with: {
      variants: true,
      images: true,
    },
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
  
  const [variant] = await db.select().from(variantsTable).where(eq(variantsTable.id, param.variant_id));
  
  if (!variant) {
    event.error = {
      type: 'NotFound',
      message: 'Variant not found',
      variant_id: param.variant_id,
    };
    throw new NotFoundError("Variant not found")
  }
  
  event.variant = variant;
  
  const [deletedVariant] = await db.delete(variantsTable)
    .where(eq(variantsTable.id, variant.id))
    .returning();
  
  if (!deletedVariant) {
    event.error = {
      type: 'DeletionFailed',
      message: 'Variant deletion failed',
      product_slug: param.product_slug,
    };
    throw new AppError("Variant deletion failed")
  }
  
  event.deleted_variant = deletedVariant;

  return c.json({ message: `Variant with id ${deletedVariant.id} was deleted` }, 200);
})

export default app;