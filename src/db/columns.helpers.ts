import { timestamp, pgEnum } from "drizzle-orm/pg-core";

export const timestamps = {
  updated_at: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}