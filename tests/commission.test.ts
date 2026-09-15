import { describe, test, expect } from "vitest";
import { applyPayment, commissionForPayments, EMPTY_COMMISSION_STATE } from "@/lib/commission/calculate";
import { assessEligibility, isJunoSourced, isWithinTail } from "@/lib/commission/eligibility";
import { formatNzd } from "@/lib/money";

/**
 * Build-plan M6 done-when: "Every commission test case in CLAUDE.md
 * passes." Those ten cases are reproduced here verbatim, in dollars, so
 * this file can be read against the table in CLAUDE.md line by line.
 */

const RATE_BP = 600; // 6%
const CAP = 500_000; // $5,000
const d = (dollars: number) => Math.round(dollars * 100);

describe("the commission cases in CLAUDE.md", () => {
  test.each([
    ["$800 paid, Juno-sourced", [800], [48], 48],
    ["$7,000 paid, Juno-sourced", [7_000], [420], 420],
    ["$20,000 paid, Juno-sourced", [20_000], [1_200], 1_200],
    ["$30,000 paid, Juno-sourced", [30_000], [1_800], 1_800],
    ["$100,000 paid, Juno-sourced (capped)", [100_000], [5_000], 5_000],
    ["$90,000 in two parts: $40,000 then $50,000", [40_000, 50_000], [2_400, 2_600], 5_000],
    ["$7,000 paid then a $2,000 credit note", [7_000, -2_000], [420, -120], 300],
  ])("%s", (_label, payments, expectedEntries, expectedTotal) => {
    const { entries, totalCents } = commissionForPayments(payments.map(d), RATE_BP, CAP);

    expect(entries).toEqual(expectedEntries.map(d));
    expect(totalCents).toBe(d(expectedTotal));
  });

  test("$7,000 paid on a roofer_own job earns nothing", () => {
    // The arithmetic never runs — eligibility is what stops it.
    expect(assessEligibility({ jobLeadSource: "roofer_own", quotedAt: new Date(), earliestJunoLeadAt: null })).toEqual({
      eligible: false,
      reason: "roofer_own",
    });
  });

  test("a further job quoted 11 months after the original lead date still counts", () => {
    const originalLead = new Date("2026-03-15T00:00:00Z");
    const quotedAt = new Date("2027-02-15T00:00:00Z"); // 11 months later

    expect(
      assessEligibility({ jobLeadSource: "roofer_own", quotedAt, earliestJunoLeadAt: originalLead }),
    ).toEqual({ eligible: true, reason: "within_tail" });
  });

  test("a further job quoted 13 months after the original lead date earns nothing", () => {
    const originalLead = new Date("2026-03-15T00:00:00Z");
    const quotedAt = new Date("2027-04-15T00:00:00Z"); // 13 months later

    expect(
      assessEligibility({ jobLeadSource: "roofer_own", quotedAt, earliestJunoLeadAt: originalLead }),
    ).toEqual({ eligible: false, reason: "tail_expired" });
  });
});

describe("the cap", () => {
  test("bites at about $83,300 ex GST, as the spec says", () => {
    // Below the threshold, full 6%.
    expect(commissionForPayments([d(83_000)], RATE_BP, CAP).totalCents).toBe(d(4_980));
    // Above it, capped.
    expect(commissionForPayments([d(84_000)], RATE_BP, CAP).totalCents).toBe(CAP);
  });

  test("applies across all payments on a job, not per payment", () => {
    // Three payments that individually are well under the cap but together
    // exceed it. A per-payment cap would wrongly allow $5,400.
    const { entries, totalCents } = commissionForPayments([d(30_000), d(30_000), d(30_000)], RATE_BP, CAP);

    expect(entries).toEqual([d(1_800), d(1_800), d(1_400)]);
    expect(totalCents).toBe(CAP);
  });

  test("a credit note against a capped job brings it back under the cap", () => {
    // $100,000 paid caps at $5,000. A $20,000 credit leaves $80,000 paid,
    // which is under the cap threshold, so commission should fall to 6% of
    // what was actually kept.
    const { entries, totalCents } = commissionForPayments([d(100_000), d(-20_000)], RATE_BP, CAP);

    expect(totalCents).toBe(d(4_800));
    expect(entries[1]).toBe(d(-200));
  });

  test("commission depends on what the job netted, not the order payments arrived in", () => {
    // The case that drove the design: these two histories net the same
    // $80,000, so they must cost the roofer the same. Accumulating
    // per-payment commission instead would bill the first $3,800 and the
    // second $4,800 — same money, different invoice.
    const viaCredit = commissionForPayments([d(100_000), d(-20_000)], RATE_BP, CAP).totalCents;
    const paidOnce = commissionForPayments([d(80_000)], RATE_BP, CAP).totalCents;

    expect(viaCredit).toBe(paidOnce);
    expect(viaCredit).toBe(d(4_800));
  });

  test("a job paid then fully refunded earns nothing overall, and never goes negative", () => {
    const { entries, totalCents } = commissionForPayments([d(7_000), d(-7_000)], RATE_BP, CAP);

    expect(entries).toEqual([d(420), d(-420)]);
    expect(totalCents).toBe(0);
  });

  test("an over-refund still can't push commission below zero", () => {
    // Shouldn't happen, but a roofer must never be owed money by Juno Logic
    // because of a data oddity in someone else's accounting system.
    const { totalCents } = commissionForPayments([d(1_000), d(-5_000)], RATE_BP, CAP);
    expect(totalCents).toBe(0);
  });
});

describe("rounding", () => {
  test("is to the cent, half-up", () => {
    // 6% of $10.08 is 60.48c.
    expect(applyPayment(EMPTY_COMMISSION_STATE, 1_008, RATE_BP, CAP).entryCents).toBe(60);
    // 6% of $10.09 is 60.54c.
    expect(applyPayment(EMPTY_COMMISSION_STATE, 1_009, RATE_BP, CAP).entryCents).toBe(61);
  });

  test("a zero payment earns zero", () => {
    expect(applyPayment(EMPTY_COMMISSION_STATE, 0, RATE_BP, CAP).entryCents).toBe(0);
  });

  test("entries always sum to the running total, however they're split", () => {
    const payments = [d(1_234.56), d(99.99), d(-250.5), d(40_000), d(50_000)];
    const { entries, totalCents } = commissionForPayments(payments, RATE_BP, CAP);

    expect(entries.reduce((sum, e) => sum + e, 0)).toBe(totalCents);
    expect(Number.isInteger(totalCents)).toBe(true);
  });

  test("the worked examples format the way the spec prints them", () => {
    expect(formatNzd(commissionForPayments([d(800)], RATE_BP, CAP).totalCents)).toBe("$48.00");
    expect(formatNzd(commissionForPayments([d(100_000)], RATE_BP, CAP).totalCents)).toBe("$5,000.00");
  });
});

describe("which work counts", () => {
  test.each([
    ["juno_ads", true],
    ["juno_website", true],
    ["juno_referral", true],
    ["roofer_own", false],
  ] as const)("%s is Juno-sourced: %s", (source, expected) => {
    expect(isJunoSourced(source)).toBe(expected);
  });

  test("a Juno-sourced job counts regardless of when it was quoted", () => {
    // The tail only matters for work the roofer booked himself later.
    expect(
      assessEligibility({
        jobLeadSource: "juno_ads",
        quotedAt: new Date("2030-01-01T00:00:00Z"),
        earliestJunoLeadAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toEqual({ eligible: true, reason: "juno_sourced" });
  });

  test("the tail runs to the same day of the month, not 365 days", () => {
    const lead = new Date("2026-02-29T00:00:00Z"); // 2026 isn't a leap year; this normalises to 1 Mar
    expect(isWithinTail(lead, new Date("2027-03-01T00:00:00Z"))).toBe(true);
    expect(isWithinTail(lead, new Date("2027-03-02T00:00:00Z"))).toBe(false);
  });

  test("the last day of the window counts, the next does not", () => {
    const lead = new Date("2026-03-15T00:00:00Z");
    expect(isWithinTail(lead, new Date("2027-03-15T00:00:00Z"))).toBe(true);
    expect(isWithinTail(lead, new Date("2027-03-16T00:00:00Z"))).toBe(false);
  });

  test("a job that was never quoted earns nothing rather than throwing", () => {
    expect(
      assessEligibility({
        jobLeadSource: "roofer_own",
        quotedAt: null,
        earliestJunoLeadAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toEqual({ eligible: false, reason: "not_quoted" });
  });
});
