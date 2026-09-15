import { describe, expect, it } from "vitest";
import { calculateQuoteTotals, lineTotalExGstCents } from "@/lib/quotes/totals";
import { centsToGstCents } from "@/lib/money";

/** Build-plan M4 done-when: "Quote totals and GST are correct to the cent in tests". */

describe("lineTotalExGstCents", () => {
  const cases: Array<{ name: string; quantityThousandths: number; unitPriceCents: number; expected: number }> = [
    { name: "12.5 m² of roof painting at $48.50/m²", quantityThousandths: 12_500, unitPriceCents: 4_850, expected: 60_625 },
    { name: "a fixed item (quantity 1)", quantityThousandths: 1_000, unitPriceCents: 45_000, expected: 45_000 },
    { name: "18.4 metres of spouting at $62.00/m", quantityThousandths: 18_400, unitPriceCents: 6_200, expected: 114_080 },
    { name: "999 m² re-roof at $185.00/m²", quantityThousandths: 999_000, unitPriceCents: 18_500, expected: 18_481_500 },
    { name: "a half-cent line total, rounded half-up", quantityThousandths: 1_500, unitPriceCents: 1, expected: 2 },
    { name: "a third of a unit, exact", quantityThousandths: 333, unitPriceCents: 3_000, expected: 999 },
  ];

  for (const { name, quantityThousandths, unitPriceCents, expected } of cases) {
    it(`is correct to the cent for ${name}`, () => {
      expect(lineTotalExGstCents({ quantityThousandths, unitPriceCents })).toBe(expected);
    });
  }
});

describe("calculateQuoteTotals", () => {
  it("computes subtotal, GST and total for a typical multi-line quote", () => {
    const totals = calculateQuoteTotals([
      { quantityThousandths: 12_500, unitPriceCents: 4_850 }, // $606.25
      { quantityThousandths: 18_400, unitPriceCents: 6_200 }, // $1,140.80
      { quantityThousandths: 1_000, unitPriceCents: 45_000 }, // $450.00
    ]);

    expect(totals.subtotalExGstCents).toBe(219_705);
    expect(totals.gstCents).toBe(32_956); // 219705 × 15% = 32955.75, rounded half-up
    expect(totals.totalIncGstCents).toBe(252_661);
  });

  it("rounds GST once on the subtotal, not per line", () => {
    // Three $10.10 lines. Per-line GST would be round(151.5) = 152 each = 456c.
    // One rounding on the $30.30 subtotal gives round(454.5) = 455c. The
    // penny between them is exactly what this rule is here to prevent.
    const lines = [
      { quantityThousandths: 1_000, unitPriceCents: 1_010 },
      { quantityThousandths: 1_000, unitPriceCents: 1_010 },
      { quantityThousandths: 1_000, unitPriceCents: 1_010 },
    ];
    const totals = calculateQuoteTotals(lines);

    const perLineGst = lines.reduce((sum, line) => sum + centsToGstCents(lineTotalExGstCents(line)), 0);
    expect(perLineGst).toBe(456);
    expect(totals.gstCents).toBe(455);
    expect(totals.totalIncGstCents).toBe(3_485);
  });

  it("keeps total = subtotal + GST exactly, across awkward amounts", () => {
    const quotes = [
      [{ quantityThousandths: 1_000, unitPriceCents: 1 }], // a one-cent line: GST rounds to zero
      [{ quantityThousandths: 1_000, unitPriceCents: 3_333 }],
      [{ quantityThousandths: 7_333, unitPriceCents: 9_999 }],
      [{ quantityThousandths: 999_000, unitPriceCents: 18_500 }],
      [
        { quantityThousandths: 1_010, unitPriceCents: 1_010 },
        { quantityThousandths: 33, unitPriceCents: 7 },
      ],
    ];

    for (const lines of quotes) {
      const totals = calculateQuoteTotals(lines);
      expect(totals.totalIncGstCents).toBe(totals.subtotalExGstCents + totals.gstCents);
      expect(Number.isInteger(totals.gstCents)).toBe(true);
      expect(Number.isInteger(totals.subtotalExGstCents)).toBe(true);
    }
  });

  it("charges no GST on a one-cent line, because 15% of 1c rounds to nothing", () => {
    const totals = calculateQuoteTotals([{ quantityThousandths: 1_000, unitPriceCents: 1 }]);

    expect(totals.subtotalExGstCents).toBe(1);
    expect(totals.gstCents).toBe(0);
    expect(totals.totalIncGstCents).toBe(1);
  });

  it("returns zeroes for a quote with no lines", () => {
    const totals = calculateQuoteTotals([]);

    expect(totals).toMatchObject({ subtotalExGstCents: 0, gstCents: 0, totalIncGstCents: 0 });
    expect(totals.lineTotalsExGstCents).toEqual([]);
  });

  it("snapshots the GST rate it used, and honours an overridden rate", () => {
    expect(calculateQuoteTotals([]).gstRateBp).toBe(1_500);

    // 12.5% was the NZ rate until 2010 — proof the rate is a parameter, so a
    // quote's stored figures stay reproducible if the rate ever changes again.
    const totals = calculateQuoteTotals([{ quantityThousandths: 1_000, unitPriceCents: 10_000 }], 1_250);
    expect(totals.gstCents).toBe(1_250);
    expect(totals.totalIncGstCents).toBe(11_250);
    expect(totals.gstRateBp).toBe(1_250);
  });
});
