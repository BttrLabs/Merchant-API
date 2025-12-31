import { z, createRoute } from '@hono/zod-openapi'

import { NotFoundError, AppError } from "@/errors"

import { ImageSchema, CreateImageSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { imagesTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for creating images
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

// POST /products/{product_slug}/images
const route = createRoute({
  method: 'post',
  path: '/{product_slug}/images',
  summary: 'Add a product image',
  description: 'Adds a new image to a product. Provide the image URL (hosted externally), alt text for accessibility, and optional display order. Requires admin authentication.',
  tags: ["Images"],
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
          schema: CreateImageSchema
        }
      }
    }
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ImageSchema
        },
      },
      description: 'Created image',
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
    
  const product = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.slug, param.product_slug),
    with: {
      images: true,
    },
  });
  
  if (!product) {
    event.error = {
      type: 'NotFound',
      message: 'Product not found',
      product_slug: param.product_slug,
    };
    throw new NotFoundError("Product not found");
  };
  
  event.product = product;
  
  const [image] = await db.insert(imagesTable)
    .values({ product_id: product.id, ...body })
    .returning();
    
  if (!image) {
    event.error = {
      type: 'InsertionFailed',
      message: 'Image inserting failed',
      data: { product_id: product.id, ...body }
    };
    throw new AppError("Image creation failed")
  };

  event.image = image;

  return c.json(ImageSchema.parse(image), 200);
})

export default app;