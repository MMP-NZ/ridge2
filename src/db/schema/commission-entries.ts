import { pgTable, uuid, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { jobs } from "./jobs";
import { invoicePayments } from "./invoice-payments";

/**
 * What Juno Logic earned on one payment. The line items behind the monthly
 * statement, and behind the invoice M7 will raise to the roofer.
 *
 * `invoicePaymentId` is UNIQUE: one entry per payment, enforced by the
 * database. Paired with the unique `xeroPaymentId` on invoice_payments,
 * that makes double-charging a roofer structurally impossible rather than
 * a thing app code has to remember — which is the right place for the
 * guarantee when the output is a bill.
 *
 * Rate, cap and the running figures are stored on every entry rather than
 * looked up live. A statement from eight months ago must still explain
 * itself if Juno Logic ever changes a roofer's terms, and "here is the
 * arithmetic as it stood" is the only version worth showing someone who
 * is querying their bill.
 */
export const commissionEntries = pgTable(
  "commission_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    invoicePaymentId: uuid("invoice_payment_id")
      .notNull()
      .unique()
      .references(() => invoicePayments.id, { onDelete: "cascade" }),

    /** Signed: negative when a credit note claws commission back. */
    amountCents: integer("amount_cents").notNull(),

    rateBp: integer("rate_bp").notNull(),
    capCents: integer("cap_cents").notNull(),
    /** The job's cumulative net paid and commission *after* this entry. */
    netPaidExGstCents: integer("net_paid_ex_gst_cents").notNull(),
    runningCommissionCents: integer("running_commission_cents").notNull(),
    /** True when the cap is holding this job's commission below 6%. */
    capped: boolean("capped").notNull().default(false),

    /** Why this job earns commission — "juno_sourced" or "within_tail". */
    eligibilityReason: text("eligibility_reason").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commission_entries_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("commission_entries_tenant_job_idx").on(table.tenantId, table.jobId),
  ],
);

export type CommissionEntry = typeof commissionEntries.$inferSelect;
export type NewCommissionEntry = typeof commissionEntries.$inferInsert;
