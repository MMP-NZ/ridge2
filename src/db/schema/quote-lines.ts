import { pgTable, uuid, integer, text, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { quotes } from "./quotes";
import { priceBookItems, priceBookKindEnum } from "./price-book-items";

/**
 * One line of a quote. Description, kind and rate are snapshotted from the
 * price book at the time the line was added — priceBookItemId is kept only
 * as a back-reference (and goes null if the item is later deleted), so
 * repricing the price book can never rewrite a quote that has gone out.
 *
 * Quantities are integer thousandths of a unit, never floats: 12.5 m² is
 * 12500. See src/lib/quotes/totals.ts for the arithmetic.
 */
export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    priceBookItemId: uuid("price_book_item_id").references(() => priceBookItems.id, { onDelete: "set null" }),

    description: text("description").notNull(),
    kind: priceBookKindEnum("kind").notNull(),
    quantityThousandths: integer("quantity_thousandths").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(), // ex GST
    lineTotalExGstCents: integer("line_total_ex_gst_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("quote_lines_tenant_quote_idx").on(table.tenantId, table.quoteId)],
);

export type QuoteLine = typeof quoteLines.$inferSelect;
export type NewQuoteLine = typeof quoteLines.$inferInsert;
