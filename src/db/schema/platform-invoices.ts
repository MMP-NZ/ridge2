import { pgTable, uuid, integer, text, date, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const platformInvoiceStatusEnum = pgEnum("platform_invoice_status", ["draft", "sent", "paid", "voided"]);

/**
 * What Juno Logic billed one roofer for one month: plan fee, commission and
 * ad top-ups, kept as separate figures because the build plan's done-when
 * check is that they appear as separate lines and the roofer can see what
 * he's paying for.
 *
 * UNIQUE(tenant_id, period_month) is what stops a month being billed twice
 * — the failure mode that matters most here, since the person it would hurt
 * is a paying customer.
 *
 * Amounts are ex GST. Whether GST is added is Juno Logic's Xero's business,
 * and depends on a registration question the spec leaves open for the
 * accountant.
 */
export const platformInvoices = pgTable(
  "platform_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** First day of the month being billed. */
    periodMonth: date("period_month").notNull(),

    planFeeCents: integer("plan_fee_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    adTopUpsCents: integer("ad_top_ups_cents").notNull(),
    totalExGstCents: integer("total_ex_gst_cents").notNull(),

    status: platformInvoiceStatusEnum("status").notNull().default("draft"),
    xeroInvoiceId: text("xero_invoice_id"),
    invoiceNumber: text("invoice_number"),

    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("platform_invoices_tenant_month_unique").on(table.tenantId, table.periodMonth),
    index("platform_invoices_month_idx").on(table.periodMonth),
  ],
);

export type PlatformInvoice = typeof platformInvoices.$inferSelect;
