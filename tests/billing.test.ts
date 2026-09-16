import { describe, test, expect } from "vitest";
import { calculateBilling, planFeeForMonth, STANDARD_PLAN_FEES, type BillingInput } from "@/lib/billing/calculate";
import { formatNzd } from "@/lib/money";

/**
 * Build-plan M7 done-when checks 1 and 2:
 * - the invoice shows plan fee, commission and ad top-ups as separate lines,
 *   correct to the cent
 * - the free month and founding-price dates drive billing correctly
 */

const d = (dollars: number) => Math.round(dollars * 100);
const month = (iso: string) => new Date(`${iso}T00:00:00Z`);

function input(overrides: Partial<BillingInput> = {}): BillingInput {
  return {
    periodMonth: month("2026-11-01"),
    plan: "basic",
    monthlyFeeCents: d(200),
    freeMonthEndsAt: null,
    priceLockEndsAt: null,
    commissionCents: 0,
    adTopUpsCents: 0,
    ...overrides,
  };
}

describe("the three lines", () => {
  test("stay separate and add up to the cent", () => {
    const lines = calculateBilling(
      input({ commissionCents: d(582.44), adTopUpsCents: d(350) }),
    );

    expect(lines.planFeeCents).toBe(d(200));
    expect(lines.commissionCents).toBe(d(582.44));
    expect(lines.adTopUpsCents).toBe(d(350));
    expect(lines.totalExGstCents).toBe(d(1_132.44));
    expect(formatNzd(lines.totalExGstCents)).toBe("$1,132.44");
  });

  test("a quiet month still bills the plan fee", () => {
    const lines = calculateBilling(input());

    expect(lines.planFeeCents).toBe(d(200));
    expect(lines.totalExGstCents).toBe(d(200));
  });

  test("a MAX client bills at the MAX rate", () => {
    const lines = calculateBilling(input({ plan: "max", monthlyFeeCents: d(500) }));
    expect(lines.planFeeCents).toBe(d(500));
  });

  test("ad top-ups are passed through untouched — no markup, ever", () => {
    // CLAUDE.md locks ad spend at cost. If this ever fails, someone has
    // started taking a margin on a roofer's own ad money.
    for (const topUp of [d(100), d(333.33), d(1_000)]) {
      expect(calculateBilling(input({ adTopUpsCents: topUp })).adTopUpsCents).toBe(topUp);
    }
  });

  test("commission is passed through from the statement, not recalculated here", () => {
    // The commission engine owns that arithmetic; billing just reports it.
    const lines = calculateBilling(input({ commissionCents: d(4_999.99) }));
    expect(lines.commissionCents).toBe(d(4_999.99));
  });
});

describe("the free month", () => {
  // Signed up 20 October; the free month runs to 20 November.
  const freeMonthEndsAt = new Date("2026-11-20T00:00:00Z");

  test("waives the plan fee for a month inside it", () => {
    const lines = calculateBilling(input({ periodMonth: month("2026-11-01"), freeMonthEndsAt }));

    expect(lines.inFreeMonth).toBe(true);
    expect(lines.planFeeCents).toBe(0);
  });

  test("but not commission — it's a free plan, not free leads", () => {
    const lines = calculateBilling(
      input({ periodMonth: month("2026-11-01"), freeMonthEndsAt, commissionCents: d(420) }),
    );

    expect(lines.planFeeCents).toBe(0);
    expect(lines.commissionCents).toBe(d(420));
    expect(lines.totalExGstCents).toBe(d(420));
  });

  test("and not ad top-ups — that's his own money either way", () => {
    const lines = calculateBilling(
      input({ periodMonth: month("2026-11-01"), freeMonthEndsAt, adTopUpsCents: d(300) }),
    );
    expect(lines.totalExGstCents).toBe(d(300));
  });

  test("the month after it ends bills in full", () => {
    const lines = calculateBilling(input({ periodMonth: month("2026-12-01"), freeMonthEndsAt }));

    expect(lines.inFreeMonth).toBe(false);
    expect(lines.planFeeCents).toBe(d(200));
  });

  test("a roofer with no free month set is billed from the start", () => {
    expect(calculateBilling(input({ freeMonthEndsAt: null })).planFeeCents).toBe(d(200));
  });
});

describe("the founding price lock", () => {
  // One of the first ten roofers: $200 locked for 24 months.
  const priceLockEndsAt = new Date("2028-10-01T00:00:00Z");
  const raisedStandard = d(260); // Juno Logic puts Basic up to $260.

  test("holds his price when the list price rises", () => {
    const lines = calculateBilling(
      input({
        periodMonth: month("2027-06-01"),
        monthlyFeeCents: d(200),
        priceLockEndsAt,
        standardFeeCents: raisedStandard,
      }),
    );

    expect(lines.planFeeCents).toBe(d(200));
    expect(lines.priceLocked).toBe(true);
  });

  test("and a roofer without the lock moves to the new price", () => {
    const lines = calculateBilling(
      input({ periodMonth: month("2027-06-01"), priceLockEndsAt: null, standardFeeCents: raisedStandard }),
    );

    expect(lines.planFeeCents).toBe(raisedStandard);
    expect(lines.priceLocked).toBe(false);
  });

  test("once it lapses he moves to the list price too", () => {
    const lines = calculateBilling(
      input({
        periodMonth: month("2028-11-01"), // after the lock ends
        monthlyFeeCents: d(200),
        priceLockEndsAt,
        standardFeeCents: raisedStandard,
      }),
    );

    expect(lines.planFeeCents).toBe(raisedStandard);
    expect(lines.priceLocked).toBe(false);
  });

  test("the last month of the lock is still locked", () => {
    const lines = calculateBilling(
      input({
        periodMonth: month("2028-10-01"),
        monthlyFeeCents: d(200),
        priceLockEndsAt,
        standardFeeCents: raisedStandard,
      }),
    );
    expect(lines.planFeeCents).toBe(d(200));
  });

  test("a lock never costs him money if the list price has fallen", () => {
    // Locked at $200, list price now $180 — priceLocked is about protection,
    // so it shouldn't report a "lock" that's working against him.
    const lines = calculateBilling(
      input({ monthlyFeeCents: d(200), priceLockEndsAt, standardFeeCents: d(180) }),
    );
    expect(lines.priceLocked).toBe(false);
  });

  test("the free month wins over the lock while both apply", () => {
    const lines = calculateBilling(
      input({
        periodMonth: month("2026-11-01"),
        freeMonthEndsAt: new Date("2026-11-20T00:00:00Z"),
        priceLockEndsAt,
        monthlyFeeCents: d(200),
      }),
    );
    expect(lines.planFeeCents).toBe(0);
  });
});

describe("standard prices", () => {
  test("match what CLAUDE.md sells", () => {
    expect(STANDARD_PLAN_FEES.basic).toBe(d(200));
    expect(STANDARD_PLAN_FEES.max).toBe(d(500));
  });

  test("are used when no per-tenant price applies", () => {
    const fee = planFeeForMonth(input({ plan: "max", monthlyFeeCents: d(1), priceLockEndsAt: null }));
    // No lock, so the stored $0.01 is ignored in favour of the real price.
    expect(fee.cents).toBe(d(500));
  });
});
