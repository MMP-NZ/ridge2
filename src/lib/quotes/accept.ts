import { and, eq } from "drizzle-orm";
import { quotes, jobs, type Job, type Quote } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { advanceLeadStageTo, closeLead } from "@/lib/crm/leads";

export interface AcceptanceEvidence {
  /** Typed by the customer on the quote page — this is what they're signing with. */
  acceptedName: string;
  ip?: string;
  userAgent?: string;
}

export type AcceptQuoteResult =
  | { status: "accepted"; quote: Quote; job: Job }
  | { status: "already_accepted"; quote: Quote }
  | { status: "not_acceptable"; quote: Quote };

/**
 * The customer accepting online: the moment a lead becomes work.
 *
 * Records who accepted and from where, marks the lead `won` and creates the
 * job M5 will schedule (build-plan M4 done-when). A second tap of the
 * button returns `already_accepted` rather than creating a second job —
 * and jobs.quote_id being UNIQUE is the real guarantee behind that, for two
 * requests arriving at once.
 */
export async function acceptQuote(
  tx: AppTx,
  tenantId: string,
  quoteId: string,
  evidence: AcceptanceEvidence,
): Promise<AcceptQuoteResult> {
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)));
  if (!quote) throw new Error("Quote not found");

  if (quote.status === "accepted") return { status: "already_accepted", quote };
  if (quote.status !== "sent") return { status: "not_acceptable", quote };

  const [accepted] = await tx
    .update(quotes)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedName: evidence.acceptedName,
      acceptedIp: evidence.ip,
      acceptedUserAgent: evidence.userAgent,
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)))
    .returning();

  const [job] = await tx
    .insert(jobs)
    .values({
      tenantId,
      quoteId: accepted.id,
      leadId: accepted.leadId,
      customerId: accepted.customerId,
      propertyId: accepted.propertyId,
    })
    .returning();

  await advanceLeadStageTo(tx, tenantId, accepted.leadId, "won", { type: "system" });

  return { status: "accepted", quote: accepted, job };
}

export type DeclineQuoteResult = { status: "declined" | "not_declinable"; quote: Quote };

/**
 * The customer saying no. Closes the lead as lost, which also stops the
 * follow-ups — nagging someone who has already chosen another roofer is
 * how a roofer gets a bad name locally.
 */
export async function declineQuote(
  tx: AppTx,
  tenantId: string,
  quoteId: string,
  reason?: string,
): Promise<DeclineQuoteResult> {
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)));
  if (!quote) throw new Error("Quote not found");

  if (quote.status !== "sent") return { status: "not_declinable", quote };

  const [declined] = await tx
    .update(quotes)
    .set({ status: "declined", declinedAt: new Date(), declineReason: reason, updatedAt: new Date() })
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)))
    .returning();

  await closeLead(tx, tenantId, declined.leadId, { type: "system" });

  return { status: "declined", quote: declined };
}
