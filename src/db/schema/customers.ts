import { pgTable, uuid, text, boolean, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

/**
 * A homeowner or landlord. Never logs in — they only ever reach the
 * platform through booking links, quote pages and payment links (spec
 * section 2). commercialConsent gates commercial messages only (reviews,
 * promotions) — transactional messages (confirmations, invoices) are
 * always allowed regardless of this flag (CLAUDE.md messaging rules).
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    commercialConsent: boolean("commercial_consent").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("customers_tenant_phone_idx").on(table.tenantId, table.phone),
    index("customers_tenant_email_idx").on(table.tenantId, table.email),
    check("customers_phone_or_email_chk", sql`${table.phone} is not null or ${table.email} is not null`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
