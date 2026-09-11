/**
 * Time zone is always Pacific/Auckland (CLAUDE.md non-negotiable). Store UTC
 * in the database (Postgres `timestamp with time zone` columns already do
 * this), only convert to local time for display or for local-time business
 * rules like "quote days run 8am-4pm" or "don't send texts before 8am".
 *
 * Deliberately built on the platform Intl APIs rather than a date library —
 * Node's ICU data handles the NZ daylight-saving transitions (first Sunday
 * in April / last Sunday in September) correctly without an extra dependency.
 */

export const NZ_TIME_ZONE = "Pacific/Auckland";

/** The UTC offset in minutes for Pacific/Auckland at the given instant (handles DST). */
export function nzOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: NZ_TIME_ZONE,
    timeZoneName: "shortOffset",
  });
  const part = dtf.formatToParts(date).find((p) => p.type === "timeZoneName");
  // e.g. "GMT+13" or "GMT+12"
  const match = part?.value.match(/GMT([+-]\d+)(?::(\d+))?/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + Math.sign(hours || 1) * minutes;
}

export interface NzDateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday .. 6 = Saturday
}

/** Breaks a UTC instant into its Pacific/Auckland local calendar/clock parts. */
export function toNzParts(date: Date): NzDateParts {
  const dtf = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl reports midnight as "24" with hour12:false in some engines; normalise to 0.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday],
  };
}

/**
 * Builds the UTC instant for a given Pacific/Auckland local date + time,
 * correctly accounting for DST. Used to turn "quote day slot at 9:00am on
 * 12 Oct" (a local business concept) into the UTC instant stored in the DB.
 */
export function nzLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  // First guess treats the local time as if it were UTC, then corrects by
  // the actual NZ offset at that instant (handles DST because we re-derive
  // the offset from the corrected guess).
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = nzOffsetMinutes(new Date(naiveUtc));
  return new Date(naiveUtc - offsetMinutes * 60_000);
}

export function formatNzDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", { timeZone: NZ_TIME_ZONE, dateStyle: "medium" }).format(date);
}

export function formatNzDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** True if `date` (in NZ local time) falls between 8am and 8pm inclusive — the daytime-only SMS sending window. */
export function isNzDaytimeHours(date: Date): boolean {
  const { hour } = toNzParts(date);
  return hour >= 8 && hour < 20;
}

/**
 * If `date` already falls in the 8am-8pm NZ daytime window, returns it
 * unchanged; otherwise returns 8am NZ time on the same day (if `date` is
 * before 8am) or the next day (if at/after 8pm). Used for non-urgent sends
 * (CLAUDE.md: "Non-urgent texts go out in daytime hours only") like the
 * day-before visit reminder, which is computed as a plain time offset and
 * may land outside daytime hours.
 */
export function nextDaytimeSendTime(date: Date): Date {
  if (isNzDaytimeHours(date)) return date;

  const { year, month, day, hour } = toNzParts(date);
  if (hour < 8) {
    return nzLocalToUtc(year, month, day, 8, 0);
  }
  // hour >= 20: push to 8am the next local day.
  const nextDay = new Date(nzLocalToUtc(year, month, day, 8, 0).getTime() + 24 * 60 * 60 * 1000);
  const nextParts = toNzParts(nextDay);
  return nzLocalToUtc(nextParts.year, nextParts.month, nextParts.day, 8, 0);
}
