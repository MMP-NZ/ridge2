import { toNzParts } from "@/lib/time";
import type { CalendarRules } from "@/db/schema";

/**
 * Picking days to do the work.
 *
 * Pure, like the quote-slot generator it's modelled on
 * (src/lib/booking/slots.ts) — no database access, so the rules that matter
 * are directly testable, including across a daylight saving change.
 *
 * Work days are Monday to Saturday minus his quote days. That's derived
 * rather than configured: CLAUDE.md locks "roofer sets 1-2 quote days a
 * week, the rest are work days", and a second calendar setting could only
 * ever contradict the first. Sunday is left alone.
 *
 * Dates here are plain NZ calendar dates as `YYYY-MM-DD` strings, matching
 * the `date` column on job_days. A work day is a whole day, not an instant,
 * so there is no timezone in it to get wrong.
 */

export type WorkDate = string; // YYYY-MM-DD

export function toWorkDate(date: Date): WorkDate {
  const { year, month, day } = toNzParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function weekdayOf(workDate: WorkDate): number {
  const [year, month, day] = workDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
}

function addDays(workDate: WorkDate, days: number): WorkDate {
  const [year, month, day] = workDate.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function isWorkDay(rules: Pick<CalendarRules, "quoteDaysOfWeek">, workDate: WorkDate): boolean {
  const weekday = weekdayOf(workDate);
  if (weekday === 0) return false; // Sunday
  return !rules.quoteDaysOfWeek.includes(weekday);
}

export interface SuggestOptions {
  /** Days that already hold work — suggestions step around them. */
  takenDates: Iterable<WorkDate>;
  estimatedDays: number;
  /** First date to consider, normally today. */
  from: WorkDate;
  /** How many alternative runs to offer. */
  count?: number;
  /** How far ahead to look before giving up. */
  horizonDays?: number;
}

/**
 * Offers a few runs of consecutive work days long enough for the job.
 *
 * "Consecutive" means consecutive *work* days, not calendar days: a
 * three-day job starting Monday runs Mon/Wed/Thu if Tuesday is a quote day.
 * That's why the caller stores the days it gets back rather than a start
 * date and a length.
 *
 * Days already holding work are skipped. Several jobs a day is allowed in
 * the data model, but the platform never proposes it — doubling up should be
 * the roofer's deliberate choice, not something the software did to him.
 */
export function suggestWorkDays(
  rules: Pick<CalendarRules, "quoteDaysOfWeek">,
  { takenDates, estimatedDays, from, count = 3, horizonDays = 60 }: SuggestOptions,
): WorkDate[][] {
  const taken = new Set(takenDates);
  const needed = Math.max(1, estimatedDays);

  const available: WorkDate[] = [];
  for (let offset = 0; offset < horizonDays; offset++) {
    const candidate = addDays(from, offset);
    if (isWorkDay(rules, candidate) && !taken.has(candidate)) available.push(candidate);
  }

  const runs: WorkDate[][] = [];
  for (let start = 0; start + needed <= available.length && runs.length < count; start++) {
    runs.push(available.slice(start, start + needed));
  }

  return runs;
}
