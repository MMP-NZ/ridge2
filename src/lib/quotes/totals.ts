import { NZ_GST_RATE_BP, centsToGstCents } from "@/lib/money";

/**
 * Quote maths, in integer cents only (CLAUDE.md non-negotiable).
 *
 * Quantities are integer thousandths of a unit, never floats: 12.5 m² is
 * 12500. A roofer's measurements routinely carry decimals, and thousandths
 * keep them exact all the way to the cent.
 *
 * Rounding happens exactly twice: once per line, and once on the whole-quote
 * GST. GST is deliberately NOT rounded per line — that drifts by a cent or
 * two across a multi-line quote against the customer's own arithmetic. One
 * rounding on the subtotal matches how an IRD tax invoice reads and makes
 * total = subtotal + GST exact by construction.
 */

export interface QuoteLineAmounts {
  quantityThousandths: number;
  unitPriceCents: number;
}

export interface QuoteTotals {
  lineTotalsExGstCents: number[];
  subtotalExGstCents: number;
  gstCents: number;
  totalIncGstCents: number;
  gstRateBp: number;
}

export function lineTotalExGstCents(line: QuoteLineAmounts): number {
  return Math.round((line.unitPriceCents * line.quantityThousandths) / 1000);
}

export function calculateQuoteTotals(
  lines: readonly QuoteLineAmounts[],
  gstRateBp: number = NZ_GST_RATE_BP,
): QuoteTotals {
  const lineTotalsExGstCents = lines.map(lineTotalExGstCents);
  const subtotalExGstCents = lineTotalsExGstCents.reduce((sum, cents) => sum + cents, 0);
  const gstCents = centsToGstCents(subtotalExGstCents, gstRateBp);

  return {
    lineTotalsExGstCents,
    subtotalExGstCents,
    gstCents,
    totalIncGstCents: subtotalExGstCents + gstCents,
    gstRateBp,
  };
}
