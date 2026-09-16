import { pgTable, uuid, integer, text, timestamp, date, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { jobs } from "./jobs";

// Xero's own invoice states, kept in their vocabulary so the mirror is
// obviously a mirror. DRAFT is what we create; the roofer approves it in
// Xero, which moves it to AUTHORISED.
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "submitted",
  "authorised",
  "paid",
  "voided",
  "deleted",
]);

/**
 * A copy of the Xero invoice raised for a completed job.
 *
 * This is a **read-mirror, not a ledger** — CLAUDE.md locks "never build a
 * ledger", and that stands. Xero remains the truth about what the customer
 * owes and has paid. We keep a copy so commission can be calculated,
 * overdue chasing can run, and the roofer can see where a job stands
 * without us hammering someone else's API on every page load.
 *
 * Amounts are ex GST because that's what commission is calculated on
 * (CLAUDE.md: "commission is always calculated on ex GST amounts").
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "cascade" }),

    xeroInvoiceId: text("xero_invoice_id").notNull(),
    invoiceNumber: text("invoice_number"),
    status: invoiceStatusEnum("status").notNull().default("draft"),

    totalExGstCents: integer("total_ex_gst_cents").notNull().default(0),
    totalIncGstCents: integer("total_inc_gst_cents").notNull().default(0),
    /** Net of credit notes, ex GST — the figure commission is derived from. */
    netPaidExGstCents: integer("net_paid_ex_gst_cents").notNull().default(0),

    dueDate: date("due_date"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("invoices_tenant_status_idx").on(table.tenantId, table.status),
    index("invoices_tenant_xero_id_idx").on(table.tenantId, table.xeroInvoiceId),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
