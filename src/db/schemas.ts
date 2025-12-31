import { z } from '@hono/zod-openapi'

// Enums
export const CartStatusSchema = z.enum(['active', 'ordered', 'abandoned']);
export const OrderStatusSchema = z.enum(['pending', 'paid', 'failed', 'cancelled', 'returned', 'refunded']);
export const StripeStatusSchema = z.enum(['initiated', 'requires_payment_method', 'succeeded', 'failed', 'canceled']);

// Timestamps
export const TimestampsSchema = z.object({
  created_at: z.preprocess((val) => val instanceof Date ? val.toISOString() : val, z.string().datetime()),
  updated_at: z.preprocess((val) => val instanceof Date ? val.toISOString() : val, z.string().datetime()),
});


// Variants
export const VariantSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  title: z.string().min(1, 'Variant title is required'),
  price: z.string(),
  sku: z.string().min(1, 'SKU is required'),
  option: z.string().min(1, 'Option is required'),
  barcode: z.string().min(1, 'Barcode is required'),
  weight: z.number().int().optional(),
  weight_unit: z.string().optional(),
  currency: z.string().length(3).optional(),
  max_quantity: z.number().int().optional(),
  min_quantity: z.number().int(),
}).merge(TimestampsSchema);

// Images
export const ImageSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  position: z.number().int(),
  alt: z.string().min(1, 'Alt text is required'),
  width: z.string().optional(),
  height: z.string().optional(),
  src: z.string().min(1, 'Image src is required'),
}).merge(TimestampsSchema);

// Products
export const ProductSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  vendor: z.string().min(1, 'Vendor is required'),
  product_type: z.string().min(1, 'Product type is required'),
  variants: z.array(VariantSchema).default([]),
  images: z.array(ImageSchema).default([]),
}).merge(TimestampsSchema);

// Cart Items
export const CartItemSchema = z.object({
  id: z.string().uuid(),
  cart_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  currency: z.string().length(3).optional(),
});

// Carts
export const CartSchema = z.object({
  id: z.string().uuid(),
  expires_at: z.preprocess((val) => val instanceof Date ? val.toISOString() : val, z.string().datetime()),
  items: z.array(CartItemSchema),
});

// Order Items
export const OrderItemSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unit_price: z.string(),
  currency: z.string(),
}).merge(TimestampsSchema);

// Orders
export const OrderSchema = z.object({
  id: z.string().uuid(),
  cart_id: z.string().uuid(),
  
  // Stripe references
  stripe_checkout_session_id: z.string().optional().nullable(),
  stripe_payment_intent_id: z.string().optional().nullable(),
  
  // Customer info
  email: z.string().optional().nullable(),
  customer_name: z.string().optional().nullable(),
  
  // Shipping info
  shipping_name: z.string().optional().nullable(),
  shipping_address_line1: z.string().optional().nullable(),
  shipping_address_line2: z.string().optional().nullable(),
  shipping_city: z.string().optional().nullable(),
  shipping_state: z.string().optional().nullable(),
  shipping_postal_code: z.string().optional().nullable(),
  shipping_country: z.string().optional().nullable(),
  
  // Order totals
  subtotal: z.string().optional().nullable(),
  tax: z.string().optional().nullable(),
  shipping_cost: z.string().optional().nullable(),
  total: z.string().optional().nullable(),
  currency: z.string().length(3),
  
  // Order status
  status: OrderStatusSchema,
  
  // Relations
  items: z.array(OrderItemSchema).default([]),
}).merge(TimestampsSchema);

export const UpdateOrderSchema = z.object({
  status: OrderStatusSchema.optional(),
  email: z.string().email().optional(),
  customer_name: z.string().optional(),
  shipping_name: z.string().optional(),
  shipping_address_line1: z.string().optional(),
  shipping_address_line2: z.string().optional(),
  shipping_city: z.string().optional(),
  shipping_state: z.string().optional(),
  shipping_postal_code: z.string().optional(),
  shipping_country: z.string().optional(),
});

// Payments
export const PaymentSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  status: StripeStatusSchema,
  stripe_payment_intent_id: z.string(),
  stripe_charge_id: z.string().optional(),
  amount: z.number(),
  currency: z.string(),
}).merge(TimestampsSchema);

// Create Schemas (omit ID & timestamps)
export const CreateVariantSchema = VariantSchema.omit({ id: true, product_id: true, created_at: true, updated_at: true });
export const CreateImageSchema = ImageSchema.omit({ id: true, product_id: true, created_at: true, updated_at: true });
export const CreateProductSchema = ProductSchema.omit({
  id: true,
  variants: true,
  images: true,
  created_at: true,
  updated_at: true,
}).extend({
  variants: z.array(CreateVariantSchema),
  images: z.array(CreateImageSchema),
});
export const CreateCartItemSchema = CartItemSchema.omit({ id: true, cart_id: true, currency: true, product_id: true });
export const CreateCartSchema = CartSchema.omit({ id: true, items: true, created_at: true, updated_at: true });
export const CreateOrderItemSchema = OrderItemSchema.omit({ id: true, created_at: true, updated_at: true });
export const CreateOrderSchema = OrderSchema.omit({ id: true, items: true, created_at: true, updated_at: true });
export const CreatePaymentSchema = PaymentSchema.omit({ id: true, created_at: true, updated_at: true });

// Inventory
export const InventorySchema = z.object({
  id: z.string().uuid(),
  variant_id: z.string().uuid(),
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative'),
}).merge(TimestampsSchema);

export const CreateInventorySchema = InventorySchema.omit({ id: true, created_at: true, updated_at: true }).extend({
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative'),
});
export const UpdateInventorySchema = z.object({
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative').optional(),
  adjust: z.number().int().optional(),
}).refine(
  (data) => data.stock_quantity !== undefined || data.adjust !== undefined,
  { message: "Either stock_quantity or adjust must be provided" }
);

// Reservations
export const ReservationSchema = z.object({
  id: z.string().uuid(),
  cart_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  quantity: z.number().int(),
  expires_at: z.preprocess((val) => val instanceof Date ? val.toISOString() : val, z.string().datetime()),
}).merge(TimestampsSchema);

export const CreateReservationSchema = ReservationSchema.omit({ id: true, created_at: true, updated_at: true });

// Update Schemas (partial updates)
export const UpdateProductSchema = ProductSchema.omit({ id: true, variants: true, images: true, created_at: true, updated_at: true }).partial();
export const UpdateVariantSchema = VariantSchema.omit({ id: true, product_id: true, created_at: true, updated_at: true }).partial();

// Pagination
export const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1)).default('1').openapi({
    param: { name: 'page', in: 'query' },
    example: '1',
    description: 'Page number (1-indexed)',
  }),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default('20').openapi({
    param: { name: 'limit', in: 'query' },
    example: '20',
    description: 'Items per page (max 100)',
  }),
});

export const PaginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  total_pages: z.number().int(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
});

export const createPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationMetaSchema,
  });
