import { eq } from "drizzle-orm";
import {
  tenants,
  customers,
  properties,
  leads,
  leadEvents,
  visits,
  visitPhotos,
  quotes,
  quoteLines,
  jobs,
  jobDays,
  jobPhotos,
  messages,
  invoices,
  invoicePayments,
  commissionEntries,
  platformInvoices,
} from "@/db/schema";
import { withStaffTenantAccess } from "@/lib/auth/with-tenant-context";

/**
 * Everything Juno Logic holds about one roofer, as a single JSON bundle.
 *
 * CLAUDE.md: "Any roofer can export all his data." This is what makes that
 * true — and it exists for the moment a roofer leaves, which is precisely
 * when a platform is most tempted to make his data hard to take with him.
 *
 * The read goes through withStaffTenantAccess, so pulling a roofer's whole
 * history is itself written to the audit log he can see. A departing client
 * asking "who looked at my data" deserves a real answer.
 *
 * Photo *bytes* aren't embedded — a bundle with a hundred roof photos
 * base64'd into it is unusable. They're listed with their storage keys and
 * the bundle says so plainly.
 */
export interface TenantExport {
  exportedAt: string;
  tenant: unknown;
  customers: unknown[];
  properties: unknown[];
  leads: unknown[];
  leadEvents: unknown[];
  visits: unknown[];
  visitPhotos: unknown[];
  quotes: unknown[];
  quoteLines: unknown[];
  jobs: unknown[];
  jobDays: unknown[];
  jobPhotos: unknown[];
  messages: unknown[];
  invoices: unknown[];
  invoicePayments: unknown[];
  commissionEntries: unknown[];
  platformInvoices: unknown[];
  notes: string[];
}

export async function exportTenant(staffUserId: string, tenantId: string): Promise<TenantExport> {
  return withStaffTenantAccess(staffUserId, tenantId, "tenant.export", async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));

    // Written out one query per table rather than through a generic helper.
    // A helper needs casts to accept seventeen differently-shaped tables,
    // and casts here would switch off exactly the type checking that stops
    // a column being quietly dropped from a departing roofer's data.
    return {
      exportedAt: new Date().toISOString(),
      tenant,
      customers: await tx.select().from(customers).where(eq(customers.tenantId, tenantId)),
      properties: await tx.select().from(properties).where(eq(properties.tenantId, tenantId)),
      leads: await tx.select().from(leads).where(eq(leads.tenantId, tenantId)),
      leadEvents: await tx.select().from(leadEvents).where(eq(leadEvents.tenantId, tenantId)),
      visits: await tx.select().from(visits).where(eq(visits.tenantId, tenantId)),
      visitPhotos: await tx.select().from(visitPhotos).where(eq(visitPhotos.tenantId, tenantId)),
      quotes: await tx.select().from(quotes).where(eq(quotes.tenantId, tenantId)),
      quoteLines: await tx.select().from(quoteLines).where(eq(quoteLines.tenantId, tenantId)),
      jobs: await tx.select().from(jobs).where(eq(jobs.tenantId, tenantId)),
      jobDays: await tx.select().from(jobDays).where(eq(jobDays.tenantId, tenantId)),
      jobPhotos: await tx.select().from(jobPhotos).where(eq(jobPhotos.tenantId, tenantId)),
      messages: await tx.select().from(messages).where(eq(messages.tenantId, tenantId)),
      invoices: await tx.select().from(invoices).where(eq(invoices.tenantId, tenantId)),
      invoicePayments: await tx.select().from(invoicePayments).where(eq(invoicePayments.tenantId, tenantId)),
      commissionEntries: await tx.select().from(commissionEntries).where(eq(commissionEntries.tenantId, tenantId)),
      platformInvoices: await tx.select().from(platformInvoices).where(eq(platformInvoices.tenantId, tenantId)),
      notes: [
        "Amounts are integer cents, exclusive of GST unless a field says otherwise.",
        "Photos are listed with their storage keys; the image files are supplied separately on request.",
        "Invoices here mirror the roofer's own Xero, which remains the source of truth for what a customer owes.",
      ],
    };
  });
}
