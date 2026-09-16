import {
  XeroAuthError,
  type CreateInvoiceInput,
  type XeroClient,
  type XeroInvoice,
  type XeroPayment,
  type XeroTokens,
  type XeroContactInput,
} from "./types";

/**
 * The real Xero adapter.
 *
 * **Unexercised.** Juno Logic's Xero app doesn't exist yet, so nothing has
 * ever run against a live tenant — exactly the position M3's Meta adapter
 * was in. It's written now so the shape is settled and the shared
 * interface is honest about what a real implementation needs; treat it as
 * a starting point to verify against a Xero demo company once an app is
 * approved, not as working code.
 *
 * Xero specifics worth knowing before that day:
 * - Money is decimal strings, not cents. Everything crossing our interface
 *   is integer cents, so conversion happens here and nowhere else.
 * - `LineAmountTypes: "Exclusive"` keeps our ex-GST amounts ex GST; NZ GST
 *   is applied by Xero from the account's tax rate.
 * - Every call needs both the bearer token and a `Xero-Tenant-Id` header.
 * - Refresh tokens rotate on use (see connection.ts).
 */
const XERO_API = "https://api.xero.com/api.xro/2.0";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

function decimalToCents(value: string | number | undefined): number {
  if (value === undefined) return 0;
  return Math.round(Number(value) * 100);
}

function basicAuthHeader(): string {
  const id = process.env.XERO_CLIENT_ID;
  const secret = process.env.XERO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("XERO_CLIENT_ID / XERO_CLIENT_SECRET are not set (see .env.example)");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function tokenRequest(body: URLSearchParams): Promise<XeroTokens> {
  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (response.status === 400 || response.status === 401) {
    // Xero returns 400 invalid_grant for an expired or already-rotated
    // refresh token — the roofer has to reconnect, nothing else will fix it.
    throw new XeroAuthError(`Xero rejected the token request (${response.status})`);
  }
  if (!response.ok) throw new Error(`Xero token request failed: ${response.status}`);

  const json = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };

  const connections = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${json.access_token}`, Accept: "application/json" },
  });
  if (!connections.ok) throw new Error(`Xero connections lookup failed: ${connections.status}`);
  const [first] = (await connections.json()) as Array<{ tenantId: string; tenantName?: string }>;
  if (!first) throw new XeroAuthError("No Xero organisation is connected to this authorisation");

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    xeroTenantId: first.tenantId,
    organisationName: first.tenantName,
  };
}

async function xeroFetch(tokens: XeroTokens, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Xero-Tenant-Id": tokens.xeroTenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (response.status === 401) throw new XeroAuthError("Xero rejected the access token");
  if (!response.ok) throw new Error(`Xero request failed: ${response.status} ${path}`);
  return response.json();
}

interface XeroApiInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Status?: string;
  SubTotal?: number;
  Total?: number;
  DueDateString?: string;
  Payments?: Array<{ PaymentID: string; Amount: number; Date: string }>;
  CreditNotes?: Array<{ CreditNoteID: string; AppliedAmount?: number; Total?: number; Date?: string }>;
}

function mapInvoice(raw: XeroApiInvoice): XeroInvoice {
  const payments: XeroPayment[] = (raw.Payments ?? []).map((p) => ({
    xeroPaymentId: p.PaymentID,
    kind: "payment" as const,
    amountExGstCents: decimalToCents(p.Amount),
    paidAt: new Date(p.Date),
  }));

  for (const credit of raw.CreditNotes ?? []) {
    payments.push({
      xeroPaymentId: credit.CreditNoteID,
      kind: "credit_note",
      // Negative, so the commission engine needs no separate path.
      amountExGstCents: -decimalToCents(credit.AppliedAmount ?? credit.Total),
      paidAt: credit.Date ? new Date(credit.Date) : new Date(),
    });
  }

  return {
    xeroInvoiceId: raw.InvoiceID,
    invoiceNumber: raw.InvoiceNumber ?? null,
    status: (raw.Status ?? "DRAFT").toLowerCase() as XeroInvoice["status"],
    totalExGstCents: decimalToCents(raw.SubTotal),
    totalIncGstCents: decimalToCents(raw.Total),
    dueDate: raw.DueDateString ? new Date(raw.DueDateString) : null,
    payments,
  };
}

export const xeroApiClient: XeroClient = {
  async exchangeCode(code, redirectUri) {
    return tokenRequest(
      new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    );
  },

  async refresh(refreshToken) {
    return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  },

  async upsertContact(tokens, contact: XeroContactInput) {
    const body = {
      Contacts: [
        {
          Name: contact.name,
          EmailAddress: contact.email,
          Phones: contact.phone ? [{ PhoneType: "MOBILE", PhoneNumber: contact.phone }] : undefined,
        },
      ],
    };
    const json = (await xeroFetch(tokens, "/Contacts", { method: "POST", body: JSON.stringify(body) })) as {
      Contacts: Array<{ ContactID: string }>;
    };
    return { contactId: json.Contacts[0].ContactID };
  },

  async createDraftInvoice(tokens, input: CreateInvoiceInput) {
    const body = {
      Invoices: [
        {
          Type: "ACCREC",
          Contact: { Name: input.contact.name, EmailAddress: input.contact.email },
          // Drafts only — CLAUDE.md locks invoices as drafts for his approval.
          Status: "DRAFT",
          LineAmountTypes: "Exclusive",
          Reference: input.reference,
          DueDate: input.dueDate?.toISOString().slice(0, 10),
          LineItems: input.lines.map((line) => ({
            Description: line.description,
            Quantity: line.quantityThousandths / 1000,
            UnitAmount: centsToDecimal(line.unitPriceCents),
          })),
        },
      ],
    };

    const json = (await xeroFetch(tokens, "/Invoices", { method: "POST", body: JSON.stringify(body) })) as {
      Invoices: XeroApiInvoice[];
    };
    return mapInvoice(json.Invoices[0]);
  },

  async getInvoicesUpdatedSince(tokens, since) {
    const json = (await xeroFetch(tokens, "/Invoices?where=Type%3D%3D%22ACCREC%22", {
      // Xero's own delta mechanism — far cheaper than paging everything.
      headers: since ? { "If-Modified-Since": since.toISOString() } : {},
    })) as { Invoices?: XeroApiInvoice[] };
    return (json.Invoices ?? []).map(mapInvoice);
  },

  async getInvoice(tokens, xeroInvoiceId) {
    const json = (await xeroFetch(tokens, `/Invoices/${xeroInvoiceId}`)) as { Invoices?: XeroApiInvoice[] };
    const [invoice] = json.Invoices ?? [];
    return invoice ? mapInvoice(invoice) : null;
  },
};
