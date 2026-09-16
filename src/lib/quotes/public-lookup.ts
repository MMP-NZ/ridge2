import { eq } from "drizzle-orm";
import { authDb, withSystemTenantContext } from "@/db/client";
import { quotes, tenants, customers, properties, visitPhotos, type QuoteLine, type QuoteStatus } from "@/db/schema";
import { and } from "drizzle-orm";
import { listQuoteLines } from "./quotes";

export interface PublicQuotePageData {
  quoteId: string;
  tenantId: string;
  status: QuoteStatus;
  businessName: string;
  customerName: string;
  propertyAddress: string;
  lines: QuoteLine[];
  subtotalExGstCents: number;
  gstCents: number;
  totalIncGstCents: number;
  notes: string | null;
  validUntil: Date | null;
  acceptedName: string | null;
  acceptedAt: Date | null;
  photoIds: string[];
}

/**
 * Everything the public /quote/[quoteToken] page needs, resolved from just
 * the token — the customer has no login and never gets one.
 *
 * Same two-step shape as getBookingPageData (M2): ridge_auth resolves the
 * token to a tenant (the quotes_auth_lookup policy in 0009_quotes_rls.sql
 * grants it SELECT on this one table and nothing else), then everything
 * afterwards goes through the normal RLS-enforced system context.
 */
export async function getQuotePageData(quoteToken: string): Promise<PublicQuotePageData | null> {
  const [quote] = await authDb().select().from(quotes).where(eq(quotes.quoteToken, quoteToken)).limit(1);
  if (!quote) return null;

  return withSystemTenantContext(quote.tenantId, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, quote.tenantId));
    const [customer] = await tx.select().from(customers).where(eq(customers.id, quote.customerId));
    const [property] = await tx.select().from(properties).where(eq(properties.id, quote.propertyId));
    const lines = await listQuoteLines(tx, quote.tenantId, quote.id);

    // Only the photos the roofer ticked for the customer to see, and only
    // from the visit this quote came from.
    const photos = quote.visitId
      ? await tx
          .select({ id: visitPhotos.id })
          .from(visitPhotos)
          .where(
            and(
              eq(visitPhotos.tenantId, quote.tenantId),
              eq(visitPhotos.visitId, quote.visitId),
              eq(visitPhotos.includeInQuote, true),
            ),
          )
      : [];

    return {
      quoteId: quote.id,
      tenantId: quote.tenantId,
      status: quote.status,
      businessName: tenant.businessName,
      customerName: customer.name,
      propertyAddress: property.address,
      lines,
      subtotalExGstCents: quote.subtotalExGstCents,
      gstCents: quote.gstCents,
      totalIncGstCents: quote.totalIncGstCents,
      notes: quote.notes,
      validUntil: quote.validUntil,
      acceptedName: quote.acceptedName,
      acceptedAt: quote.acceptedAt,
      photoIds: photos.map((p) => p.id),
    };
  });
}
