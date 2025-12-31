import { z, createRoute } from '@hono/zod-openapi'
import { ProductSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { NotFoundError } from "@/errors"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /products/{product_slug}
const route = createRoute({
  method: 'get',
  path: '/{product_slug}',
  summary: 'Get a product',
  description: 'Retrieves a single product by its URL slug, including all variants and images.',
  tags: ["Products"],
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
          description: 'The URL-friendly slug of the product',
        }),
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProductSchema
        },
      },
      description: 'The product with its variants and images',
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
      product_slug: param.product_slug
    };
    throw new NotFoundError("Product not found")
  }

  event.product = product;
 
  return c.json(ProductSchema.parse(product), 200);
})

export default app;