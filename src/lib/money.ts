/**
 * Money is always stored and computed as integer cents (CLAUDE.md
 * non-negotiable) — never floats. Amounts are ex GST with GST tracked as a
 * separate field; NZ GST is a flat 15%.
 */

export const NZ_GST_RATE_BP = 1500; // 15.00%, in basis points (1/100 of a percent)

/** Rounds to nearest cent, half-up. All money math must round explicitly — never rely on float truncation. */
function roundHalfUpToInt(value: number): number {
  return Math.round(value);
}

export function centsToGstCents(exGstCents: number, rateBp: number = NZ_GST_RATE_BP): number {
  return roundHalfUpToInt((exGstCents * rateBp) / 10_000);
}

export function centsIncludingGst(exGstCents: number, rateBp: number = NZ_GST_RATE_BP): number {
  return exGstCents + centsToGstCents(exGstCents, rateBp);
}

/** Applies a basis-point rate (e.g. commission at 600bp = 6%) to an ex-GST amount, rounded half-up. */
export function applyBasisPoints(exGstCents: number, rateBp: number): number {
  return roundHalfUpToInt((exGstCents * rateBp) / 10_000);
}

export function formatNzd(cents: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(cents / 100);
}
