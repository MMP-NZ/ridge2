/**
 * CLAUDE.md names XeroClient as one of the integrations wrapped behind a
 * small internal interface so it can be faked in tests and swapped later.
 * This is it.
 *
 * Juno Logic's Xero app doesn't exist yet, so M6 is built and tested
 * against the fake — the same way M3 was built against simulated Meta
 * payloads. The real adapter is written but unexercised until an app is
 * approved; getting there is an account-provisioning task, not a code one.
 *
 * Amounts crossing this boundary are integer cents, like everywhere else.
 * Xero itself talks in decimal strings; converting is the adapter's job,
 * not the caller's.
 */

export interface XeroTokens {
  accessToken: string;
  /** Xero rotates this on every refresh — persist the new one or the connection dies. */
  refreshToken: string;
  expiresAt: Date;
  xeroTenantId: string;
  organisationName?: string;
}

export interface XeroContactInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface XeroInvoiceLine {
  description: string;
  /** Integer thousandths, matching quote_lines. */
  quantityThousandths: number;
  unitPriceCents: number;
}

export interface CreateInvoiceInput {
  contact: XeroContactInput;
  lines: XeroInvoiceLine[];
  reference?: string;
  dueDate?: Date;
}

export interface XeroInvoice {
  xeroInvoiceId: string;
  invoiceNumber: string | null;
  status: "draft" | "submitted" | "authorised" | "paid" | "voided" | "deleted";
  totalExGstCents: number;
  totalIncGstCents: number;
  dueDate: Date | null;
  payments: XeroPayment[];
}

export interface XeroPayment {
  xeroPaymentId: string;
  kind: "payment" | "credit_note";
  /** Ex GST. Negative for a credit note. */
  amountExGstCents: number;
  paidAt: Date;
}

/**
 * Thrown when Xero rejects our credentials — revoked from their side, or a
 * rotated refresh token we failed to persist. Distinct from any other
 * failure because it's the only one the roofer can fix, by reconnecting.
 */
export class XeroAuthError extends Error {
  constructor(message = "Xero authorisation failed") {
    super(message);
    this.name = "XeroAuthError";
  }
}

export interface XeroClient {
  /** Completes the OAuth handshake after the roofer authorises Juno Logic's app. */
  exchangeCode(code: string, redirectUri: string): Promise<XeroTokens>;
  /** Access tokens last 30 minutes. Throws XeroAuthError when the refresh token is no longer good. */
  refresh(refreshToken: string): Promise<XeroTokens>;

  upsertContact(tokens: XeroTokens, contact: XeroContactInput): Promise<{ contactId: string }>;
  /** Always a DRAFT — CLAUDE.md locks invoices as drafts for the roofer's approval. */
  createDraftInvoice(tokens: XeroTokens, input: CreateInvoiceInput): Promise<XeroInvoice>;

  /** The twice-daily poll: everything that changed since the last watermark. */
  getInvoicesUpdatedSince(tokens: XeroTokens, since: Date | null): Promise<XeroInvoice[]>;
  /** One invoice, fresh — used before chasing an overdue one, to avoid nagging someone who has paid. */
  getInvoice(tokens: XeroTokens, xeroInvoiceId: string): Promise<XeroInvoice | null>;
}
