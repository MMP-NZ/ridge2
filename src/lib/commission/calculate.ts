import { applyBasisPoints } from "@/lib/money";

/**
 * Juno Logic's commission: 6% of paid invoice value ex GST, on
 * Juno-sourced jobs only, capped at $5,000 per job (CLAUDE.md).
 *
 * Pure — no database, no Xero — because this decides what a roofer owes,
 * and every one of the ten cases in CLAUDE.md has to be provable without
 * standing anything up.
 *
 * Commission follows money received, not money invoiced: an entry is
 * created per payment as it arrives, so part payments earn as they come in
 * and a credit note takes commission back off.
 */

export interface CommissionState {
  /** Cumulative money received on this job, ex GST. Credits subtract. */
  netPaidExGstCents: number;
  /** Commission earned so far across every entry on this job. */
  commissionCents: number;
}

export const EMPTY_COMMISSION_STATE: CommissionState = { netPaidExGstCents: 0, commissionCents: 0 };

export interface PaymentResult {
  /** The entry to record for this payment. Negative for a credit note. */
  entryCents: number;
  state: CommissionState;
  /** True once the cap is holding this job's commission down. */
  capped: boolean;
}

/**
 * Commission is always 6% of what the job has *netted so far*, capped —
 * and each entry is simply the difference from what's already been
 * charged.
 *
 * Deriving it from cumulative net rather than by accumulating per-payment
 * commission is deliberate, and it matters once the cap has bitten.
 * Consider $100,000 paid then $20,000 credited. Accumulating commission
 * gives $5,000 (capped) then −$1,200, landing at $3,800 — yet the same
 * roofer paid $80,000 in one go would owe $4,800. Same money received,
 * different bill depending on the order it arrived in, which is not
 * something you can defend on an invoice. Working from the net makes the
 * result depend only on what the job actually earned.
 *
 * CLAUDE.md's ten cases pass under either reading — they never combine a
 * credit note with the cap — so this is a decision the spec doesn't make.
 * See docs/decisions.md.
 *
 * The lower clamp at zero matters too: a full refund takes commission back
 * to nothing and no further, so Juno Logic never ends up owing a roofer
 * money because of a correction in someone else's accounting system.
 */
export function applyPayment(
  state: CommissionState,
  paymentExGstCents: number,
  rateBp: number,
  capCents: number,
): PaymentResult {
  const netPaidExGstCents = state.netPaidExGstCents + paymentExGstCents;
  const uncapped = applyBasisPoints(Math.max(netPaidExGstCents, 0), rateBp);
  const commissionCents = Math.min(uncapped, capCents);

  return {
    entryCents: commissionCents - state.commissionCents,
    state: { netPaidExGstCents, commissionCents },
    capped: uncapped > capCents,
  };
}

/** Replays a job's whole payment history — used by tests and the statement. */
export function commissionForPayments(
  payments: number[],
  rateBp: number,
  capCents: number,
): { entries: number[]; totalCents: number } {
  let state = EMPTY_COMMISSION_STATE;
  const entries = payments.map((payment) => {
    const result = applyPayment(state, payment, rateBp, capCents);
    state = result.state;
    return result.entryCents;
  });
  return { entries, totalCents: state.commissionCents };
}
