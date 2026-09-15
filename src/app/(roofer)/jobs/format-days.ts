import { formatNzDate, nzLocalToUtc } from "@/lib/time";
import type { WorkDate } from "@/lib/scheduling/work-days";

/**
 * Turns a work date into an instant that formats back to the same NZ
 * calendar day.
 *
 * Midday NZ time, not midday UTC: New Zealand runs up to 13 hours ahead, so
 * Date.UTC(...12:00) on the 12th is 1am on the 13th here — which is exactly
 * the off-by-one that put the wrong day in customer messages.
 */
export function workDateToDate(workDate: WorkDate): Date {
  const [year, month, day] = workDate.split("-").map(Number);
  return nzLocalToUtc(year, month, day, 12, 0);
}

export function formatWorkDate(workDate: WorkDate): string {
  return formatNzDate(workDateToDate(workDate));
}

/** "Mon 12 Oct" style, for a compact run of days. */
export function describeWorkDays(days: WorkDate[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return formatWorkDate(days[0]);
  return `${formatWorkDate(days[0])} – ${formatWorkDate(days[days.length - 1])} (${days.length} days)`;
}
