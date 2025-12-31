import { eq } from 'drizzle-orm';

import { NotFoundError, AppError } from "@/errors"

import { z, createRoute } from '@hono/zod-openapi'

import { createDB } from "@/db/client"
import { imagesTable } from "@/db/tables"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for deleting images
app.use('*', adminAuth)

export const SuccessSchema = z.object({
  message: z.string(),
});

export const ErrorSchema = z.object({
  message: z.string(),
});

// DELETE /products/{product_slug}/images/{image_id}
const route = createRoute({
  method: 'delete',
  path: '/{product_slug}/images/{image_id}',
  summary: 'Delete an image',
  description: 'Permanently removes an image from a product. This only removes the database reference; the actual image file on the external host is not affected. Requires admin authentication.',
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
      image_id: z
        .string()
        .uuid()
        .openapi({
          param: {
            name: 'image_id',
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
    
  const param = c.req.valid('param');
  event.param = param;

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
  
  const [image] = await db.select().from(imagesTable).where(eq(imagesTable.id, param.image_id));
  
  if (!image) {
    event.error = {
      type: 'NotFound',
      message: 'Image not found',
      image_id: param.image_id,
    };
    throw new NotFoundError("Image not found");
  };
  
  const [deletedImage] = await db.delete(imagesTable)
    .where(eq(imagesTable.id, image.id))
    .returning();
  
  if (!deletedImage) {
    event.error = {
      type: 'DeletionFailed',
      message: 'Image deletion failed',
      image_id: param.image_id
    };
    throw new AppError("Image deletion failed")
  };
  
  event.deleted_image = deletedImage;

  return c.json({ message: `Image with id ${deletedImage.id} was deleted` }, 200);
})

export default app;