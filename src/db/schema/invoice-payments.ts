import { pgTable, uuid, integer, text, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { invoices } from "./invoices";

export const invoicePaymentKindEnum = pgEnum("invoice_payment_kind", ["payment", "credit_note"]);

/**
 * Money received against an invoice, as synced from Xero.
 *
 * `xeroPaymentId` is UNIQUE per tenant, and that constraint is the whole
 * reason a twice-daily poll is safe: Xero is asked for everything changed
 * since the last watermark, so the same payment is seen repeatedly, and
 * the database — not app logic — is what stops it being counted twice.
 * Commission is money, so this guarantee belongs somewhere it can't be
 * forgotten.
 *
 * `amountExGstCents` is signed: a credit note is a negative payment, which
 * is what lets the commission engine treat both with one code path.
 */
export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    /** Xero's payment or credit-note id. The idempotency key for re-polling. */
    xeroPaymentId: text("xero_payment_id").notNull(),
    kind: invoicePaymentKindEnum("kind").notNull().default("payment"),
    /** Negative for a credit note or refund. Ex GST, because commission is. */
    amountExGstCents: integer("amount_ex_gst_cents").notNull(),

    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("invoice_payments_tenant_xero_id_unique").on(table.tenantId, table.xeroPaymentId),
    index("invoice_payments_tenant_invoice_idx").on(table.tenantId, table.invoiceId),
  ],
);

export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type NewInvoicePayment = typeof invoicePayments.$inferInsert;
export type InvoicePaymentKind = (typeof invoicePaymentKindEnum.enumValues)[number];
