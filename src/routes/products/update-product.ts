import { z, createRoute } from '@hono/zod-openapi'
import { ProductSchema, UpdateProductSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { productsTable } from "@/db/tables"
import { NotFoundError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'
import { eq } from 'drizzle-orm'

const app = createApp()

// Require admin auth for updating products
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

// PATCH /products/{product_slug}
const route = createRoute({
  method: 'patch',
  path: '/{product_slug}',
  summary: 'Update a product',
  description: 'Updates an existing product by its slug. Only the provided fields will be updated. Requires admin authentication.',
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
          description: 'The URL-friendly slug of the product to update',
        }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateProductSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProductSchema
        },
      },
      description: 'The updated product with variants and images',
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
  
  const param = c.req.valid('param')
  event.param = param;
  
  const body = c.req.valid('json')
  event.body = body;
    
  const db = createDB(c.env.DATABASE_URL)
  
  // Find product by slug
  const existingProduct = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
  })
  
  if (!existingProduct) {
    event.error = {
      type: 'NotFound',
      message: 'Product not found',
      product_slug: param.product_slug
    };
    throw new NotFoundError("Product not found")
  }
  
  // Update product
  const [updatedProduct] = await db.update(productsTable)
    .set(body)
    .where(eq(productsTable.id, existingProduct.id))
    .returning()
  
  if (!updatedProduct) {
    event.error = {
      type: 'AppError',
      message: 'Failed to update product',
      product_slug: param.product_slug
    };
    throw new AppError("Failed to update product")
  }
  
  // Fetch updated product with relations
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.id, updatedProduct.id),
    with: {
      variants: true,
      images: true,
    },
  })

  event.updated_product = product;
 
  return c.json(ProductSchema.parse(product), 200);
})

export default app;
