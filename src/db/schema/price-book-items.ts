import { pgTable, uuid, integer, text, boolean, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// Spec section 7: "rates per m², per metre of spouting, fixed items".
export const priceBookKindEnum = pgEnum("price_book_kind", ["per_m2", "per_metre", "fixed"]);

/**
 * One roofer's editable price book. Seeded at onboarding with the services
 * the spec names (roof painting, repairs, re-roofing, spouting, moss and
 * lichen treatment, leak repairs, roof prep — the last two carry the winter
 * campaigns) and edited by him from then on.
 *
 * Rates are ex GST, like every other amount in the system. A quote line
 * snapshots the rate it was built from rather than referencing it live, so
 * editing the price book never moves the figures on a quote already sent.
 */
export const priceBookItems = pgTable(
  "price_book_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    kind: priceBookKindEnum("kind").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(), // ex GST
    unit: text("unit"), // display only, e.g. "m²", "m", "job"
    category: text("category"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("price_book_items_tenant_name_unique").on(table.tenantId, table.name),
    index("price_book_items_tenant_active_idx").on(table.tenantId, table.active),
  ],
);

export type PriceBookItem = typeof priceBookItems.$inferSelect;
export type NewPriceBookItem = typeof priceBookItems.$inferInsert;
export type PriceBookKind = (typeof priceBookKindEnum.enumValues)[number];
