import { z, createRoute } from '@hono/zod-openapi'

import { NotFoundError } from "@/errors"

import { ImageSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /products/{product_slug}/images
const route = createRoute({
  method: 'get',
  path: '/{product_slug}/images',
  summary: 'List product images',
  description: 'Retrieves all images associated with a product. Images are returned with their URLs, alt text, and display order.',
  tags: ["Images"],
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
    })
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(ImageSchema)
        },
      },
      description: 'List of product images',
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
  
  const db = createDB(c.env.DATABASE_URL)
    
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
    with: {
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
      
  event.images = product.images;

  return c.json(ImageSchema.array().parse(product.images), 200);
})

export default app;