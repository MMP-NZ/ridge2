/**
 * Turning what the roofer types into the integers everything downstream
 * uses. Parsed by splitting on the decimal point and working with the two
 * halves as integers — never by multiplying a float, which is how
 * "1.15" * 100 becomes 114.99999999999999.
 *
 * Both return null rather than throwing or guessing: the caller shows the
 * roofer an error, because silently reading "48,50" as 48 dollars would put
 * a wrong price in front of a customer.
 */

function parseScaled(raw: string, decimals: number): number | null {
  // Trimmed at the ends and stripped of thousands separators, but internal
  // whitespace is left in so the regex rejects it: "4 8" is a typo, and
  // reading it as 48 would put a wrong price in front of a customer.
  const cleaned = raw.trim().replace(/^\$\s*/, "").replace(/,/g, "");
  if (cleaned === "") return null;

  const match = new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`).exec(cleaned);
  if (!match) return null;

  const whole = Number(match[1]);
  const fractionDigits = (match[2] ?? "").padEnd(decimals, "0");
  const scale = 10 ** decimals;
  const value = whole * scale + Number(fractionDigits);

  return Number.isSafeInteger(value) ? value : null;
}

/** "48.50" -> 4850. Rejects negatives and more than two decimal places. */
export function parsePriceToCents(raw: string): number | null {
  return parseScaled(raw, 2);
}

/** "12.5" -> 12500. Three decimals is finer than anyone measures a roof. */
export function parseQuantityToThousandths(raw: string): number | null {
  return parseScaled(raw, 3);
}

/** 12500 -> "12.5", for putting a stored quantity back in an input field. */
export function formatQuantity(thousandths: number): string {
  const whole = Math.floor(thousandths / 1000);
  const fraction = String(thousandths % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
