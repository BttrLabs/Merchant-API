import { z, createRoute } from '@hono/zod-openapi'

import { VariantSchema, CreateVariantSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { variantsTable } from "@/db/tables"
import { NotFoundError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for creating variants
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

// POST /products/{product_slug}/variants
const route = createRoute({
  method: 'post',
  path: '/{product_slug}/variants',
  summary: 'Create a variant',
  description: 'Creates a new variant for a product. Variants represent purchasable options with their own SKU, price, and attributes. Inventory for the variant must be created separately. Requires admin authentication.',
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
    }),
    body: {
      content: {
        "application/json": {
          schema: CreateVariantSchema
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
      description: 'Created variant',
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
    
  const body = c.req.valid('json');
  event.body = body;

  const db = createDB(c.env.DATABASE_URL);
    
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
    with: {
      variants: true,
      images: true,
    },
  });
  
  if (!product) {
    event.error = {
      type: 'NotFound',
      message: 'Product not found',
      product_slug: param.product_slug,
    };
    throw new NotFoundError("Product not found")
  };
  
  event.product = product;
  
  const [variant] = await db.insert(variantsTable)
    .values({ product_id: product.id, ...body })
    .returning();
    
  if (!variant) {
    event.error = {
      type: 'InsertionFailed',
      message: 'Variant inserting failed',
      data: { product_id: product.id, ...body }
    };
    throw new AppError("Variant creation failed")
  };
    
  event.variant = variant;

  return c.json(VariantSchema.parse(variant), 200);
})

export default app;