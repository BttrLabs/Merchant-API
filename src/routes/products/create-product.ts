import { z, createRoute } from '@hono/zod-openapi'
import { ProductSchema, CreateProductSchema } from "@/db/schemas"
import { createDB } from "@/db/client"
import { productsTable, variantsTable, imagesTable } from "@/db/tables"
import { checkSlugExists } from "@/db/utils"

import { BadRequestError, AppError } from "@/errors"
import { createApp } from '@/lib/create-app'
import { adminAuth } from '@/middleware/admin-auth'

const app = createApp()

// Require admin auth for creating products
app.use('*', adminAuth)

export const ErrorSchema = z.object({
  message: z.string(),
});

// POST /products
const route = createRoute({
  method: 'post',
  path: '/',
  summary: 'Create a product',
  description: 'Creates a new product with optional variants and images. The slug must be unique across all products. Requires admin authentication.',
  tags: ["Products"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateProductSchema
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
      description: 'The newly created product with variants and images',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Invalid request body or slug already exists',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema
        },
      },
      description: 'Admin authentication required',
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

  const body = c.req.valid('json');
  event.body = body;
  
  const db = createDB(c.env.DATABASE_URL);
  
  if (await checkSlugExists(db, body.slug)) {
    event.error = {
      type: 'BadRequest',
      message: 'Slug already exists',
      slug: body.slug,
    };
    throw new BadRequestError("Slug already exists");
  };

  const [product] = await db.insert(productsTable)
    .values({ title: body.title, slug: body.slug, vendor: body.vendor, product_type: body.product_type })
    .returning();
  
  if (!product) {
    event.error = {
      type: 'InsertionFailed',
      message: 'Product inserting failed',
      data: { title: body.title, slug: body.slug, vendor: body.vendor, product_type: body.product_type }
    };
    throw new AppError("Product creation failed")
  };
  
  if (body.variants.length) {
    const variants = await db.insert(variantsTable)
      .values(body.variants.map(v => ({ ...v, product_id: product.id }))).returning();
    
    if (!variants.length) {
      event.error = {
        type: 'InsertionFailed',
        message: 'Variants inserting failed',
        data: body.variants.map(v => ({ ...v, product_id: product.id }))
      };
      throw new AppError("Variants creation failed")
    };
  };

  if (body.images.length) {
    const images = await db.insert(imagesTable)
      .values(body.images.map(i => ({ ...i, product_id: product.id }))).returning();
    
    if (!images.length) {
      event.error = {
        type: 'InsertionFailed',
        message: 'Images inserting failed',
        data: body.images.map(i => ({ ...i, product_id: product.id }))
      };
      throw new AppError("Images creation failed")
    };
  };

  const productWithRelations = await db.query.productsTable.findFirst({
    where: (table, { eq }) => eq(table.id, product.id),
    with: { variants: true, images: true }
  });
  
  if (!productWithRelations) {
    event.error = {
      type: 'NotFound',
      message: 'Product not found after creation',
      product_id: product.id,
    };
    throw new AppError("Product not found after creation")
  }
  
  event.product = productWithRelations;
  
  return c.json(ProductSchema.parse(productWithRelations), 200)
})

export default app;