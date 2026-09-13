import { pgTable, uuid, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One row per tenant — the running prepaid ad-spend balance (CLAUDE.md:
 * "Roofers prepay ad spend into a balance"). balanceCents is a running
 * total kept in sync with ad_balance_entries by src/lib/ads/balance.ts,
 * not recomputed by summing entries on every read.
 */
export const adBalances = pgTable(
  "ad_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    balanceCents: integer("balance_cents").notNull().default(0),
    lowBalanceThresholdCents: integer("low_balance_threshold_cents").notNull().default(20_000), // $200

    // Set when a low-balance alert fires, cleared (set back to null) once
    // a top-up brings the balance back above threshold — see
    // src/lib/ads/balance.ts's checkAndSendLowBalanceAlert. This is what
    // makes the alert fire once per threshold-crossing, not on every spend.
    lastAlertSentAt: timestamp("last_alert_sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("ad_balances_one_per_tenant").on(table.tenantId)],
);

export type AdBalance = typeof adBalances.$inferSelect;
export type NewAdBalance = typeof adBalances.$inferInsert;
