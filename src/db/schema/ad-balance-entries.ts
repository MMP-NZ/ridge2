import { pgTable, uuid, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { staffUsers } from "./staff-users";

export const adBalanceEntryTypeEnum = pgEnum("ad_balance_entry_type", ["topup", "spend"]);
export const adPlatformEnum = pgEnum("ad_platform", ["meta", "google"]);

/**
 * The ad balance ledger. Both top-ups and spend are staff-entered for M3
 * (build-plan M7 owns "top-up recording across all roofers" as an admin
 * console feature; automatic spend pulling from Meta's Ads Insights API
 * is explicitly P2) — every entry goes through withStaffTenantAccess, so
 * it's audit-logged the same way changeLeadSource (M1) is.
 */
export const adBalanceEntries = pgTable(
  "ad_balance_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    type: adBalanceEntryTypeEnum("type").notNull(),
    amountCents: integer("amount_cents").notNull(), // always positive; sign is implied by type
    platform: adPlatformEnum("platform"), // spend entries only
    campaign: text("campaign"),
    note: text("note"),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ad_balance_entries_tenant_idx").on(table.tenantId)],
);

export type AdBalanceEntry = typeof adBalanceEntries.$inferSelect;
export type NewAdBalanceEntry = typeof adBalanceEntries.$inferInsert;
export type AdBalanceEntryType = (typeof adBalanceEntryTypeEnum.enumValues)[number];
export type AdPlatform = (typeof adPlatformEnum.enumValues)[number];
