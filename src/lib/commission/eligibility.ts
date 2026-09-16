import type { LeadSource } from "@/db/schema";

/**
 * Which work Juno Logic earns commission on.
 *
 * Kept apart from the arithmetic in calculate.ts because it's a different
 * kind of rule — this one decides *whether* a job counts, and it's the part
 * that has to be defensible to a roofer who thinks he found the customer
 * himself.
 */

/** Juno brought the lead in. The roofer's own word of mouth earns nothing. */
export const JUNO_SOURCES: readonly LeadSource[] = ["juno_ads", "juno_website", "juno_referral"];

export function isJunoSourced(source: LeadSource): boolean {
  return JUNO_SOURCES.includes(source);
}

export const TAIL_MONTHS = 12;

/**
 * The 12-month tail (spec section 8): once Juno Logic has brought a
 * customer in, further work for that same customer still counts, provided
 * it was **quoted** within 12 months of the original lead date. After that
 * the customer is the roofer's and Juno Logic stops earning.
 *
 * Measured in calendar months rather than 365 days so it lands on the same
 * day of the month a roofer would count to — 12 months after 15 March is
 * 15 March, leap year or not.
 */
export function isWithinTail(originalLeadDate: Date, quotedAt: Date): boolean {
  const deadline = new Date(originalLeadDate);
  deadline.setUTCMonth(deadline.getUTCMonth() + TAIL_MONTHS);
  return quotedAt.getTime() <= deadline.getTime();
}

export interface EligibilityInput {
  /** The source of this job's own lead. */
  jobLeadSource: LeadSource;
  /** When this job's quote was sent. Null if somehow never sent. */
  quotedAt: Date | null;
  /**
   * The earliest Juno-sourced lead for this customer, if any. This is what
   * carries the tail across to later jobs the roofer booked himself.
   */
  earliestJunoLeadAt: Date | null;
}

export type EligibilityReason = "juno_sourced" | "within_tail" | "roofer_own" | "tail_expired" | "not_quoted";

export interface Eligibility {
  eligible: boolean;
  reason: EligibilityReason;
}

/**
 * A job earns commission if its own lead was Juno-sourced, or — the tail —
 * if the customer came from Juno originally and this job was quoted inside
 * the window.
 *
 * The reason comes back with the answer so a statement can tell the roofer
 * *why* a job did or didn't attract commission. "Because the software said
 * so" is not good enough for something he's being charged for.
 */
export function assessEligibility({
  jobLeadSource,
  quotedAt,
  earliestJunoLeadAt,
}: EligibilityInput): Eligibility {
  if (isJunoSourced(jobLeadSource)) return { eligible: true, reason: "juno_sourced" };
  if (!earliestJunoLeadAt) return { eligible: false, reason: "roofer_own" };
  if (!quotedAt) return { eligible: false, reason: "not_quoted" };

  return isWithinTail(earliestJunoLeadAt, quotedAt)
    ? { eligible: true, reason: "within_tail" }
    : { eligible: false, reason: "tail_expired" };
}
