import { sql, relations } from "drizzle-orm";
import { integer, pgTable, varchar, uuid, numeric, index, uniqueIndex, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { timestamps } from "./columns.helpers"

export const cartStatusEnum = pgEnum('cart_status', ['active', 'ordered', 'abandoned']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'failed', 'cancelled', 'returned', 'refunded']);
export const stripeStatusEnum = pgEnum('stripe_status', ['initiated', 'requires_payment_method', 'succeeded', 'failed', 'canceled']);


export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title").notNull(),
  slug: varchar("slug").notNull().unique(),
  vendor: varchar("vendor").notNull(),
  product_type: varchar("product_type").notNull(),
  ...timestamps,
});

export const variantsTable = pgTable("variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  title: varchar("title").notNull(),
  price: numeric("price").notNull(),
  sku: varchar("sku").notNull(),
  option: varchar("option").notNull(),
  barcode: varchar("barcode").notNull(),
  weight: integer("weight"),
  weight_unit: varchar("weight_unit"),
  currency: varchar("currency", { length: 3 }),
  max_quantity: integer("max_quantity"),
  min_quantity: integer("min_quantity").notNull(),  
  ...timestamps,
});

export const imagesTable = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  product_id: uuid("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  alt: varchar("alt").notNull(),
  width: varchar("width"),
  height: varchar("height"),
  src: varchar("src").notNull(),
  ...timestamps,
});

export const inventoryTable = pgTable("inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  variant_id: uuid("variant_id").notNull().references(() => variantsTable.id).unique(),
  stock_quantity: integer("stock_quantity").notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex("inventory_variant_id_idx").on(table.variant_id),
]);

export const reservationsTable = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  cart_id: uuid("cart_id").notNull().references(() => cartsTable.id, { onDelete: "cascade" }),
  variant_id: uuid("variant_id").notNull().references(() => variantsTable.id),
  quantity: integer("quantity").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  ...timestamps,
}, (table) => [
  index("reservations_cart_id_idx").on(table.cart_id),
  index("reservations_variant_id_idx").on(table.variant_id),
  index("reservations_expires_at_idx").on(table.expires_at),
]);

export const inventoryRelations = relations(inventoryTable, ({ one, many }) => ({
  variant: one(variantsTable, {
    fields: [inventoryTable.variant_id],
    references: [variantsTable.id],
  }),
  reservations: many(reservationsTable),
}));

export const reservationsRelations = relations(reservationsTable, ({ one }) => ({
  cart: one(cartsTable, {
    fields: [reservationsTable.cart_id],
    references: [cartsTable.id],
  }),
  variant: one(variantsTable, {
    fields: [reservationsTable.variant_id],
    references: [variantsTable.id],
  }),
  inventory: one(inventoryTable, {
    fields: [reservationsTable.variant_id],
    references: [inventoryTable.variant_id],
  }),
}));

export const cartsTable = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: varchar("session_id").notNull().unique(),
  status: cartStatusEnum("status").default('active'),
  expires_at: timestamp("expires_at").notNull().default(sql`now() + interval '30 minutes'`),
  ...timestamps,
}, (table) => [
  index("carts_session_id_idx").on(table.session_id),
]);

export const cartsItemsTable = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cart_id: uuid("cart_id").notNull().references(() => cartsTable.id, { onDelete: "cascade" }),
    product_id: uuid("product_id").notNull().references(() => productsTable.id),
    variant_id: uuid("variant_id").notNull().references(() => variantsTable.id),
    quantity: integer("quantity").notNull(),
    currency: varchar("currency", { length: 3 }),
    ...timestamps,
  },
  (table) => [
    index("cart_items_cart_id_idx").on(table.cart_id),
    index("cart_items_variant_id_idx").on(table.variant_id),
  ]
);


export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Link to cart
  cart_id: uuid("cart_id").notNull().references(() => cartsTable.id).unique(),
  
  // Stripe references
  stripe_checkout_session_id: varchar("stripe_checkout_session_id").unique(),
  stripe_payment_intent_id: varchar("stripe_payment_intent_id"),
  
  // Customer info (from Stripe Checkout)
  email: varchar("email"),
  customer_name: varchar("customer_name"),
  
  // Shipping info (from Stripe Checkout)
  shipping_name: varchar("shipping_name"),
  shipping_address_line1: varchar("shipping_address_line1"),
  shipping_address_line2: varchar("shipping_address_line2"),
  shipping_city: varchar("shipping_city"),
  shipping_state: varchar("shipping_state"),
  shipping_postal_code: varchar("shipping_postal_code"),
  shipping_country: varchar("shipping_country"),
  
  // Order totals
  subtotal: numeric("subtotal"),
  tax: numeric("tax"),
  shipping_cost: numeric("shipping_cost"),
  total: numeric("total"),
  currency: varchar("currency", { length: 3 }).notNull().default('usd'),
  
  // Order status
  status: orderStatusEnum("status").notNull().default('pending'),
  
  ...timestamps,
}, (table) => [
  index("orders_cart_id_idx").on(table.cart_id),
  index("orders_email_idx").on(table.email),
  uniqueIndex("orders_checkout_session_idx").on(table.stripe_checkout_session_id),
]);

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: uuid("order_id").notNull().references(() => ordersTable.id),
    product_id: uuid("product_id").notNull().references(() => productsTable.id),
    variant_id: uuid("variant_id").notNull().references(() => variantsTable.id),
    quantity: integer("quantity").notNull(),
    unit_price: numeric("unit_price").notNull(),
    currency: varchar("currency").notNull(),
    ...timestamps,
  },
  (table) => [
    index("order_items_order_id_idx").on(table.order_id),
    index("order_items_variant_id_idx").on(table.variant_id),
  ]
);


export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: uuid("order_id").notNull().references(() => ordersTable.id),
    status: stripeStatusEnum().notNull().default('initiated'),
    
    // Stripe references
    stripe_checkout_session_id: varchar("stripe_checkout_session_id"),
    stripe_payment_intent_id: varchar("stripe_payment_intent_id").notNull(),
    stripe_charge_id: varchar("stripe_charge_id"),
    
    amount: numeric("amount").notNull(),
    currency: varchar("currency").notNull(),
    ...timestamps,
  },
  (table) => [
    index("payments_order_id_idx").on(table.order_id),
    uniqueIndex("payments_checkout_session_idx").on(table.stripe_checkout_session_id),
    uniqueIndex("payments_payment_intent_idx").on(table.stripe_payment_intent_id),
  ]
);

export const productsRelations = relations(productsTable, ({ many }) => ({
  variants: many(variantsTable),
  images: many(imagesTable),
}));

export const variantsRelations = relations(variantsTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [variantsTable.product_id],
    references: [productsTable.id],
  }),
}));

export const imagesRelations = relations(imagesTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [imagesTable.product_id],
    references: [productsTable.id],
  }),
}));

export const cartsRelations = relations(cartsTable, ({ one, many }) => ({
  items: many(cartsItemsTable),
  reservations: many(reservationsTable),
  order: one(ordersTable, {
    fields: [cartsTable.id],
    references: [ordersTable.cart_id],
  }),
}));

export const cartItemsRelations = relations(cartsItemsTable, ({ one }) => ({
  cart: one(cartsTable, {
    fields: [cartsItemsTable.cart_id],
    references: [cartsTable.id],
  }),
  product: one(productsTable, {
    fields: [cartsItemsTable.product_id],
    references: [productsTable.id],
  }),
  variant: one(variantsTable, {
    fields: [cartsItemsTable.variant_id],
    references: [variantsTable.id],
  }),
}));

export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  cart: one(cartsTable, {
    fields: [ordersTable.cart_id],
    references: [cartsTable.id],
  }),
  items: many(orderItemsTable),
  payments: many(paymentsTable),
}));

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.order_id],
    references: [ordersTable.id],
  }),
  product: one(productsTable, {
    fields: [orderItemsTable.product_id],
    references: [productsTable.id],
  }),
  variant: one(variantsTable, {
    fields: [orderItemsTable.variant_id],
    references: [variantsTable.id],
  }),
}));

export const paymentsRelations = relations(paymentsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [paymentsTable.order_id],
    references: [ordersTable.id],
  }),
}));
