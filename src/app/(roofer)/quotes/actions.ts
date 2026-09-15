"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import {
  createQuoteForVisit,
  replaceQuoteLines,
  sendQuote,
  reviseQuote,
  type QuoteLineInput,
} from "@/lib/quotes/quotes";
import { scheduleQuoteJobs } from "@/lib/jobs/schedule-quote-jobs";
import { parsePriceToCents, parseQuantityToThousandths } from "@/lib/quotes/parse";
import type { PriceBookKind } from "@/db/schema";

export interface QuoteEditorState {
  error?: string;
  savedAt?: string;
}

const KINDS: PriceBookKind[] = ["per_m2", "per_metre", "fixed"];

/** Starts a quote from a written-up visit and sends the roofer straight into the builder. */
export async function startQuoteAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const visitId = String(formData.get("visitId") ?? "");
  if (!visitId) redirect("/quotes");

  const quote = await withRooferAccess(session.tenantId, (tx) =>
    createQuoteForVisit(tx, session.tenantId, visitId),
  );

  redirect(`/quotes/${quote.id}`);
}

/**
 * Saves the whole set of lines at once rather than one at a time. A quote is
 * edited as a single document — the roofer adds three lines, changes a
 * quantity, deletes one — and replacing the lot keeps the stored totals and
 * the lines impossible to get out of step.
 */
export async function saveQuoteLinesAction(
  _prev: QuoteEditorState,
  formData: FormData,
): Promise<QuoteEditorState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Quote not found." };

  const descriptions = formData.getAll("lineDescription").map(String);
  const kinds = formData.getAll("lineKind").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const prices = formData.getAll("linePrice").map(String);
  const itemIds = formData.getAll("linePriceBookItemId").map(String);

  const lines: QuoteLineInput[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i].trim();
    // A blank row is how the roofer deletes a line — he clears it and saves.
    if (!description) continue;

    const kind = kinds[i] as PriceBookKind;
    if (!KINDS.includes(kind)) return { error: `Pick how "${description}" is charged.` };

    const quantityThousandths = parseQuantityToThousandths(quantities[i] || "1");
    const unitPriceCents = parsePriceToCents(prices[i]);
    if (quantityThousandths === null) return { error: `Enter a quantity for "${description}", like 12.5.` };
    if (unitPriceCents === null) return { error: `Enter a rate for "${description}", like 48.50.` };

    lines.push({
      description,
      kind,
      quantityThousandths,
      unitPriceCents,
      priceBookItemId: itemIds[i] || undefined,
    });
  }

  try {
    await withRooferAccess(session.tenantId, (tx) => replaceQuoteLines(tx, session.tenantId, quoteId, lines));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't save the quote." };
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { savedAt: new Date().toISOString() };
}

/**
 * Sends the quote. The messages and the 3/7-day follow-ups are queued only
 * after the transaction commits, the same way booking queues its
 * confirmation (M2) — nothing goes out for a quote that didn't save.
 */
export async function sendQuoteAction(_prev: QuoteEditorState, formData: FormData): Promise<QuoteEditorState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return { error: "Quote not found." };

  let sentAt: Date | null = null;
  try {
    const result = await withRooferAccess(session.tenantId, (tx) =>
      sendQuote(tx, session.tenantId, quoteId, { type: "roofer", id: session.rooferUserId }),
    );
    if (result.sent) sentAt = result.quote.sentAt ?? new Date();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't send the quote." };
  }

  if (sentAt) await scheduleQuoteJobs(session.tenantId, quoteId, sentAt);

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  redirect(`/quotes/${quoteId}?sent=1`);
}

/** Clones a sent quote into a new draft and supersedes the original. */
export async function reviseQuoteAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) redirect("/quotes");

  const revision = await withRooferAccess(session.tenantId, (tx) => reviseQuote(tx, session.tenantId, quoteId));

  revalidatePath("/quotes");
  redirect(`/quotes/${revision.id}`);
}
