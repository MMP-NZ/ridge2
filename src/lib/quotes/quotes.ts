import { and, asc, desc, eq } from "drizzle-orm";
import {
  quotes,
  quoteLines,
  visits,
  leads,
  type Quote,
  type QuoteLine,
  type PriceBookKind,
} from "@/db/schema";
import type { AppTx } from "@/db/client";
import { generateToken } from "@/lib/tokens";
import { advanceLeadStageTo, type LeadActor } from "@/lib/crm/leads";
import { calculateQuoteTotals, lineTotalExGstCents } from "./totals";
import { NZ_GST_RATE_BP } from "@/lib/money";

export interface QuoteLineInput {
  description: string;
  kind: PriceBookKind;
  quantityThousandths: number;
  unitPriceCents: number;
  priceBookItemId?: string;
}

/** Quote days out; the roofer's prices move, and an open-ended quote is a liability. */
const DEFAULT_VALID_DAYS = 30;

async function getQuoteOrThrow(tx: AppTx, tenantId: string, quoteId: string): Promise<Quote> {
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)));
  if (!quote) throw new Error("Quote not found");
  return quote;
}

/** Recomputes and stores the four money columns from the quote's own lines. */
async function recalculateTotals(tx: AppTx, tenantId: string, quoteId: string, gstRateBp: number): Promise<Quote> {
  const lines = await tx
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.tenantId, tenantId), eq(quoteLines.quoteId, quoteId)));

  const totals = calculateQuoteTotals(lines, gstRateBp);

  const [updated] = await tx
    .update(quotes)
    .set({
      subtotalExGstCents: totals.subtotalExGstCents,
      gstCents: totals.gstCents,
      totalIncGstCents: totals.totalIncGstCents,
      updatedAt: new Date(),
    })
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)))
    .returning();

  return updated;
}

export async function createQuoteForVisit(tx: AppTx, tenantId: string, visitId: string): Promise<Quote> {
  const [row] = await tx
    .select({ visitId: visits.id, leadId: leads.id, customerId: leads.customerId, propertyId: leads.propertyId })
    .from(visits)
    .innerJoin(leads, eq(leads.id, visits.leadId))
    .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)));
  if (!row) throw new Error("Visit not found");

  const [quote] = await tx
    .insert(quotes)
    .values({
      tenantId,
      leadId: row.leadId,
      customerId: row.customerId,
      propertyId: row.propertyId,
      visitId: row.visitId,
      quoteToken: generateToken(),
      gstRateBp: NZ_GST_RATE_BP,
      validUntil: new Date(Date.now() + DEFAULT_VALID_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning();

  return quote;
}

/**
 * Replaces a draft's lines wholesale and recomputes its totals. Refuses to
 * touch a quote that has already been sent — the customer is looking at
 * those figures, and from M6 commission is calculated against them. A
 * change to a sent quote goes through reviseQuote instead.
 */
export async function replaceQuoteLines(
  tx: AppTx,
  tenantId: string,
  quoteId: string,
  lines: QuoteLineInput[],
): Promise<Quote> {
  const quote = await getQuoteOrThrow(tx, tenantId, quoteId);
  if (quote.status !== "draft") throw new Error(`Quote is ${quote.status} and can no longer be edited`);

  await tx.delete(quoteLines).where(and(eq(quoteLines.tenantId, tenantId), eq(quoteLines.quoteId, quoteId)));

  if (lines.length > 0) {
    await tx.insert(quoteLines).values(
      lines.map((line, index) => ({
        tenantId,
        quoteId,
        priceBookItemId: line.priceBookItemId,
        description: line.description,
        kind: line.kind,
        quantityThousandths: line.quantityThousandths,
        unitPriceCents: line.unitPriceCents,
        lineTotalExGstCents: lineTotalExGstCents(line),
        sortOrder: index,
      })),
    );
  }

  return recalculateTotals(tx, tenantId, quoteId, quote.gstRateBp);
}

export async function listQuoteLines(tx: AppTx, tenantId: string, quoteId: string): Promise<QuoteLine[]> {
  return tx
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.tenantId, tenantId), eq(quoteLines.quoteId, quoteId)))
    .orderBy(asc(quoteLines.sortOrder));
}

export interface SendQuoteResult {
  quote: Quote;
  /** False when the quote had already been sent — nothing re-sent, no second timeline entry. */
  sent: boolean;
}

/**
 * Marks a quote sent and moves the lead to `quoted`. The message itself is
 * queued by the caller after the transaction commits, the same way booking
 * queues its confirmation (M2).
 */
export async function sendQuote(
  tx: AppTx,
  tenantId: string,
  quoteId: string,
  actor: LeadActor,
): Promise<SendQuoteResult> {
  const quote = await getQuoteOrThrow(tx, tenantId, quoteId);
  if (quote.status === "sent") return { quote, sent: false };
  if (quote.status !== "draft") throw new Error(`Quote is ${quote.status} and can't be sent`);

  const lines = await listQuoteLines(tx, tenantId, quoteId);
  if (lines.length === 0) throw new Error("Add at least one line before sending");

  // Recompute rather than trust what's stored: the roofer may have edited
  // the price book between building this quote and sending it, and the
  // figures that go out must match the lines exactly.
  const recalculated = await recalculateTotals(tx, tenantId, quoteId, quote.gstRateBp);

  const [updated] = await tx
    .update(quotes)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, quoteId)))
    .returning();

  await advanceLeadStageTo(tx, tenantId, recalculated.leadId, "quoted", actor);

  return { quote: updated, sent: true };
}

/**
 * Supersedes a sent quote with a fresh draft carrying the same lines.
 *
 * "Can you add the spouting while you're there" is the most ordinary
 * request a roofer gets, and editing the original in place would move
 * figures the customer has already seen — and, from M6, the figures
 * commission is owed on. A new quote keeps both versions honest.
 */
export async function reviseQuote(tx: AppTx, tenantId: string, quoteId: string): Promise<Quote> {
  const original = await getQuoteOrThrow(tx, tenantId, quoteId);
  if (original.status === "accepted") throw new Error("That quote has been accepted — it can't be revised");

  const lines = await listQuoteLines(tx, tenantId, quoteId);

  const [revision] = await tx
    .insert(quotes)
    .values({
      tenantId,
      leadId: original.leadId,
      customerId: original.customerId,
      propertyId: original.propertyId,
      visitId: original.visitId,
      quoteToken: generateToken(),
      gstRateBp: original.gstRateBp,
      notes: original.notes,
      validUntil: new Date(Date.now() + DEFAULT_VALID_DAYS * 24 * 60 * 60 * 1000),
      supersedesQuoteId: original.id,
    })
    .returning();

  if (lines.length > 0) {
    await tx.insert(quoteLines).values(
      lines.map((line) => ({
        tenantId,
        quoteId: revision.id,
        priceBookItemId: line.priceBookItemId,
        description: line.description,
        kind: line.kind,
        quantityThousandths: line.quantityThousandths,
        unitPriceCents: line.unitPriceCents,
        lineTotalExGstCents: line.lineTotalExGstCents,
        sortOrder: line.sortOrder,
      })),
    );
  }

  await tx
    .update(quotes)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(and(eq(quotes.tenantId, tenantId), eq(quotes.id, original.id)));

  return recalculateTotals(tx, tenantId, revision.id, revision.gstRateBp);
}

export async function listQuotes(tx: AppTx, tenantId: string): Promise<Quote[]> {
  return tx
    .select()
    .from(quotes)
    .where(eq(quotes.tenantId, tenantId))
    .orderBy(desc(quotes.createdAt));
}
