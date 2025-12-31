import { z, createRoute } from '@hono/zod-openapi'
import { createDB } from "@/db/client"
import { productsTable } from "@/db/tables"
import { eq } from 'drizzle-orm';
import { NotFoundError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for deleting products
app.use('*', adminAuth)

export const SuccessSchema = z.object({
  message: z.string(),
});

export const ErrorSchema = z.object({
  message: z.string(),
});

// DELETE /products/{product_slug}
const route = createRoute({
  method: 'delete',
  path: '/{product_slug}',
  summary: 'Delete a product',
  description: 'Permanently deletes a product and all its associated variants and images. This action cannot be undone. Requires admin authentication.',
  tags: ["Products"],
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
          example: 'blue-widget',
          description: 'The URL-friendly slug of the product to delete',
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
      description: 'Product successfully deleted',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Admin authentication required',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Product not found',
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

  const param = c.req.valid('param');
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
  
  const [deletedProduct] = await db.delete(productsTable)
    .where(eq(productsTable.id, product.id))
    .returning();
  
  if (!deletedProduct) {
    event.error = {
      type: 'DeletionFailed',
      message: 'Product deletion failed',
      product_id: product.id,
    };
    throw new AppError("Product deletion failed")
  };
  
  event.deleted_product = deletedProduct;

  return c.json({ message: `Product with id ${deletedProduct.id} was deleted` }, 200);
})

export default app;