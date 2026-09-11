import { toNzParts, nzLocalToUtc } from "@/lib/time";
import type { CalendarRules } from "@/db/schema";

export interface ExistingVisit {
  startAt: Date;
  propertyAddress?: string;
}

export interface OpenSlotsResult {
  /** True if propertyAddress falls outside the tenant's service area — no slots are offered at all. */
  declined: boolean;
  slots: Date[];
}

function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  // Pure calendar arithmetic (no timezone conversion) — Date.UTC correctly
  // rolls over month/year boundaries regardless of what "day" overflows to.
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat, matches toNzParts().weekday
}

function significantWords(address: string): string[] {
  return address
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2);
}

export function isWithinServiceArea(rules: Pick<CalendarRules, "serviceAreaSuburbs">, address: string): boolean {
  if (!rules.serviceAreaSuburbs || rules.serviceAreaSuburbs.length === 0) return true;
  const lower = address.toLowerCase();
  return rules.serviceAreaSuburbs.some((suburb) => lower.includes(suburb.toLowerCase()));
}

/**
 * Generates open quote-day slots between fromDate and toDate (inclusive,
 * read as NZ calendar dates). Pure function — no DB access — so it's
 * directly unit-testable, including across DST transitions (nzLocalToUtc
 * does the actual local-to-UTC conversion).
 */
export function generateOpenSlots(
  rules: CalendarRules,
  existingVisits: ExistingVisit[],
  propertyAddress: string | undefined,
  fromDate: Date,
  toDate: Date,
  now: Date,
): OpenSlotsResult {
  if (propertyAddress && !isWithinServiceArea(rules, propertyAddress)) {
    return { declined: true, slots: [] };
  }

  const start = toNzParts(fromDate);
  const end = toNzParts(toDate);
  const daySpan = Math.round(
    (Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86_400_000,
  );

  const bookedTimes = new Set(existingVisits.map((v) => v.startAt.getTime()));

  const countByDay = new Map<string, number>();
  for (const visit of existingVisits) {
    const p = toNzParts(visit.startAt);
    const key = `${p.year}-${p.month}-${p.day}`;
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const targetWords = propertyAddress ? new Set(significantWords(propertyAddress)) : null;

  const slotsByDay: { slots: Date[]; hasNearbyBooking: boolean }[] = [];

  for (let i = 0; i <= daySpan; i++) {
    const { year, month, day } = addCalendarDays(start.year, start.month, start.day, i);
    const weekday = weekdayOf(year, month, day);
    if (!rules.quoteDaysOfWeek.includes(weekday)) continue;

    const dayKey = `${year}-${month}-${day}`;
    if (rules.maxVisitsPerQuoteDay != null && (countByDay.get(dayKey) ?? 0) >= rules.maxVisitsPerQuoteDay) {
      continue;
    }

    const stepMinutes = rules.visitLengthMinutes + rules.travelBufferMinutes;
    const daySlots: Date[] = [];
    for (
      let minute = rules.quoteHoursStartMin;
      minute + rules.visitLengthMinutes <= rules.quoteHoursEndMin;
      minute += stepMinutes
    ) {
      const slot = nzLocalToUtc(year, month, day, Math.floor(minute / 60), minute % 60);
      if (slot.getTime() <= now.getTime()) continue;
      if (bookedTimes.has(slot.getTime())) continue;
      daySlots.push(slot);
    }

    if (daySlots.length === 0) continue;

    const hasNearbyBooking = Boolean(
      targetWords &&
        existingVisits.some((visit) => {
          const p = toNzParts(visit.startAt);
          if (`${p.year}-${p.month}-${p.day}` !== dayKey || !visit.propertyAddress) return false;
          return significantWords(visit.propertyAddress).some((word) => targetWords.has(word));
        }),
    );

    slotsByDay.push({ slots: daySlots, hasNearbyBooking });
  }

  // Stable sort: days with a nearby booking (same suburb-ish word as an
  // existing visit) come first, chronological order preserved within each
  // group. A text-matching stand-in for real geo-clustering — see
  // docs/decisions.md.
  slotsByDay.sort((a, b) => Number(b.hasNearbyBooking) - Number(a.hasNearbyBooking));

  return { declined: false, slots: slotsByDay.flatMap((d) => d.slots) };
}
