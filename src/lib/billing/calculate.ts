import type { Tenant } from "@/db/schema";

/**
 * What Juno Logic bills a roofer for a month.
 *
 * Pure, like the commission engine, because it decides what a paying
 * customer is charged and has to be provable without standing anything up.
 *
 * Three separate figures, never merged: the build plan's done-when check is
 * that they appear as separate lines, and a roofer looking at a bill should
 * be able to see which part is the software, which part is Juno Logic's
 * share of work it won him, and which part is his own ad money passed
 * straight through.
 */

/** Today's list prices, ex GST (CLAUDE.md: Basic $200, MAX $500). */
export const STANDARD_PLAN_FEES: Record<Tenant["plan"], number> = {
  basic: 20_000,
  max: 50_000,
};

export interface BillingInput {
  /** First day of the month being billed, as an instant. */
  periodMonth: Date;
  plan: Tenant["plan"];
  /** The price he signed at, ex GST. */
  monthlyFeeCents: number;
  freeMonthEndsAt: Date | null;
  priceLockEndsAt: Date | null;
  /** Commission entries falling in this month, already summed. */
  commissionCents: number;
  /** Ad top-ups in this month, at cost. */
  adTopUpsCents: number;
  /** Today's list price for his plan — injected so a price rise is testable. */
  standardFeeCents?: number;
}

export interface BillingLines {
  planFeeCents: number;
  commissionCents: number;
  adTopUpsCents: number;
  totalExGstCents: number;
  /** True when the month falls inside his free month, so the fee is waived. */
  inFreeMonth: boolean;
  /** True when the founding price lock is holding his fee below list price. */
  priceLocked: boolean;
}

/**
 * The plan fee for a month, honouring the free month and the founding-price
 * lock.
 *
 * The lock is what makes `monthlyFeeCents` worth storing per tenant. While
 * it holds, the roofer pays the price he signed at; once it lapses, he
 * moves to whatever the plan costs by then. Without that, "founding price
 * lock for 24 months" would be a note in a contract with nothing in the
 * software behind it.
 *
 * The free month waives the **plan fee only**. Commission still accrues —
 * the offer is a free plan, not free leads, and commission is what carries
 * the margin (see docs/decisions.md).
 */
export function planFeeForMonth(input: BillingInput): { cents: number; inFreeMonth: boolean; priceLocked: boolean } {
  const { periodMonth, plan, monthlyFeeCents, freeMonthEndsAt, priceLockEndsAt } = input;
  const standard = input.standardFeeCents ?? STANDARD_PLAN_FEES[plan];

  // The whole month is free if it ends before his free period does.
  if (freeMonthEndsAt && periodMonth.getTime() < freeMonthEndsAt.getTime()) {
    return { cents: 0, inFreeMonth: true, priceLocked: false };
  }

  const locked = Boolean(priceLockEndsAt && periodMonth.getTime() <= priceLockEndsAt.getTime());
  const cents = locked ? monthlyFeeCents : standard;

  return { cents, inFreeMonth: false, priceLocked: locked && monthlyFeeCents < standard };
}

export function calculateBilling(input: BillingInput): BillingLines {
  const { cents: planFeeCents, inFreeMonth, priceLocked } = planFeeForMonth(input);

  return {
    planFeeCents,
    commissionCents: input.commissionCents,
    // Passed on at cost with no markup — a locked CLAUDE.md decision, and
    // the reason this is a line of its own rather than folded into the fee.
    adTopUpsCents: input.adTopUpsCents,
    totalExGstCents: planFeeCents + input.commissionCents + input.adTopUpsCents,
    inFreeMonth,
    priceLocked,
  };
}
