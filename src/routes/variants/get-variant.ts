import { eq } from 'drizzle-orm';

import { z, createRoute } from '@hono/zod-openapi'

import { VariantSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { variantsTable } from "@/db/tables"
import { NotFoundError } from "@/errors"
import { createApp } from '@/lib/create-app'

const app = createApp()

export const ErrorSchema = z.object({
  message: z.string(),
});

// GET /products/{product_slug}/variants/{variant_id}
const route = createRoute({
  method: 'get',
  path: '/{product_slug}/variants/{variant_id}',
  summary: 'Get a variant',
  description: 'Retrieves a single variant by ID. Returns the variant details including SKU, price, and attributes. The product slug is used to scope the request.',
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
          schema: VariantSchema
        },
      },
      description: 'Variant details',
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

  return c.json(VariantSchema.parse(variant), 200);
})

export default app;