import { z, createRoute } from '@hono/zod-openapi'

import { VariantSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { NotFoundError } from "@/errors"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /products/{product_slug}/variants
const route = createRoute({
  method: 'get',
  path: '/{product_slug}/variants',
  summary: 'List product variants',
  description: 'Retrieves all variants for a specific product. Each variant represents a purchasable option (e.g., size, color combination) with its own SKU, price, and inventory tracking.',
  tags: ["Variants"],
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
          schema: z.array(VariantSchema)
        },
      },
      description: 'List of variants for the product',
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
        
  event.variants = product.variants;

  return c.json(VariantSchema.array().parse(product.variants), 200);
})

export default app;