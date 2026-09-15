import { centsToGstCents } from "@/lib/money";
import {
  XeroAuthError,
  type CreateInvoiceInput,
  type XeroClient,
  type XeroInvoice,
  type XeroPayment,
  type XeroTokens,
} from "./types";

/**
 * An in-memory Xero, the counterpart to messaging's log-only transport and
 * the local-disk photo store.
 *
 * This is what M6 is actually built and tested against, because Juno
 * Logic's Xero app doesn't exist yet. It's deliberately more than a stub:
 * tests need to record a payment and re-poll to prove commission lands
 * once and only once, and need to revoke access to prove the reconnect
 * prompt appears.
 */
export interface FakeXero extends XeroClient {
  /** Records money against an invoice, as if the roofer had in Xero. */
  recordPayment(xeroInvoiceId: string, amountExGstCents: number, kind?: XeroPayment["kind"]): XeroPayment;
  /** Simulates the roofer revoking Juno Logic's access from Xero's side. */
  revokeAccess(): void;
  approveInvoice(xeroInvoiceId: string): void;
  getStoredInvoice(xeroInvoiceId: string): XeroInvoice | undefined;
  readonly invoices: Map<string, XeroInvoice>;
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export function createFakeXero(): FakeXero {
  const invoices = new Map<string, XeroInvoice>();
  const updatedAt = new Map<string, Date>();
  let revoked = false;

  function assertAuthorised() {
    if (revoked) throw new XeroAuthError("Access revoked in Xero");
  }

  function tokensFor(offsetMinutes = 30): XeroTokens {
    return {
      accessToken: nextId("access"),
      // Rotated every time, exactly as Xero does — a caller that fails to
      // persist the new one will find the next refresh rejected.
      refreshToken: nextId("refresh"),
      expiresAt: new Date(Date.now() + offsetMinutes * 60 * 1000),
      xeroTenantId: "fake-xero-tenant",
      organisationName: "Demo Company (NZ)",
    };
  }

  return {
    invoices,

    async exchangeCode() {
      revoked = false;
      return tokensFor();
    },

    async refresh() {
      assertAuthorised();
      return tokensFor();
    },

    async upsertContact() {
      assertAuthorised();
      return { contactId: nextId("contact") };
    },

    async createDraftInvoice(_tokens, input: CreateInvoiceInput) {
      assertAuthorised();

      const totalExGstCents = input.lines.reduce(
        (sum, line) => sum + Math.round((line.unitPriceCents * line.quantityThousandths) / 1000),
        0,
      );
      const xeroInvoiceId = nextId("inv");
      const invoice: XeroInvoice = {
        xeroInvoiceId,
        invoiceNumber: `INV-${String(sequence).padStart(4, "0")}`,
        status: "draft",
        totalExGstCents,
        totalIncGstCents: totalExGstCents + centsToGstCents(totalExGstCents),
        dueDate: input.dueDate ?? null,
        payments: [],
      };
      invoices.set(xeroInvoiceId, invoice);
      updatedAt.set(xeroInvoiceId, new Date());
      return invoice;
    },

    async getInvoicesUpdatedSince(_tokens, since) {
      assertAuthorised();
      return [...invoices.values()].filter((invoice) => {
        if (!since) return true;
        const changed = updatedAt.get(invoice.xeroInvoiceId);
        return changed !== undefined && changed.getTime() >= since.getTime();
      });
    },

    async getInvoice(_tokens, xeroInvoiceId) {
      assertAuthorised();
      return invoices.get(xeroInvoiceId) ?? null;
    },

    recordPayment(xeroInvoiceId, amountExGstCents, kind = "payment") {
      const invoice = invoices.get(xeroInvoiceId);
      if (!invoice) throw new Error(`No fake invoice ${xeroInvoiceId}`);

      const payment: XeroPayment = {
        xeroPaymentId: nextId("pay"),
        kind,
        amountExGstCents,
        paidAt: new Date(),
      };
      invoice.payments.push(payment);

      const netPaid = invoice.payments.reduce((sum, p) => sum + p.amountExGstCents, 0);
      if (netPaid >= invoice.totalExGstCents && invoice.totalExGstCents > 0) invoice.status = "paid";
      updatedAt.set(xeroInvoiceId, new Date());
      return payment;
    },

    approveInvoice(xeroInvoiceId) {
      const invoice = invoices.get(xeroInvoiceId);
      if (invoice) {
        invoice.status = "authorised";
        updatedAt.set(xeroInvoiceId, new Date());
      }
    },

    revokeAccess() {
      revoked = true;
    },

    getStoredInvoice(xeroInvoiceId) {
      return invoices.get(xeroInvoiceId);
    },
  };
}
