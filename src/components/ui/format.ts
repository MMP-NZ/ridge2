/**
 * Presentation-only date formatting. The business-rule time helpers live in
 * `src/lib/time.ts`; these exist so a screen can show just the clock time or
 * just the day without string-surgery on a full `formatNzDateTime` result.
 */
import { NZ_TIME_ZONE } from "@/lib/time";

/** "9:00 am" */
export function formatNzTime(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "Thursday 17 September" — for the public booking page, where a homeowner
 * needs the weekday spelled out before they commit to a time. */
export function formatNzWeekdayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "Tue 16 Sep" */
export function formatNzDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}
