import { describe, test, expect } from "vitest";
import { generateOpenSlots, isWithinServiceArea } from "@/lib/booking/slots";
import { toNzParts, nzLocalToUtc } from "@/lib/time";
import type { CalendarRules } from "@/db/schema";

function makeRules(overrides: Partial<CalendarRules> = {}): CalendarRules {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    tenantId: "00000000-0000-0000-0000-000000000000",
    quoteDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    quoteHoursStartMin: 480, // 8:00am
    quoteHoursEndMin: 960, // 4:00pm
    visitLengthMinutes: 45,
    travelBufferMinutes: 15,
    maxVisitsPerQuoteDay: null,
    serviceAreaSuburbs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CalendarRules;
}

const FAR_PAST = new Date(0);

/** First slot of each NZ calendar day, in chronological order — one entry per day in range. */
function firstSlotPerDay(slots: Date[]): Date[] {
  const seen = new Map<string, Date>();
  for (const slot of slots) {
    const p = toNzParts(slot);
    const key = `${p.year}-${p.month}-${p.day}`;
    if (!seen.has(key)) seen.set(key, slot);
  }
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
}

describe("generateOpenSlots — DST correctness (Pacific/Auckland)", () => {
  test("every day's first slot lands on local 8:00am across the September DST start (spring forward)", () => {
    const rules = makeRules();
    const from = nzLocalToUtc(2026, 9, 1, 0, 0);
    const to = nzLocalToUtc(2026, 9, 30, 0, 0);
    const { slots } = generateOpenSlots(rules, [], undefined, from, to, FAR_PAST);

    const firstOfDay = firstSlotPerDay(slots);
    expect(firstOfDay.length).toBeGreaterThan(20);
    for (const slot of firstOfDay) {
      const p = toNzParts(slot);
      expect(p.hour).toBe(8);
      expect(p.minute).toBe(0);
    }

    // NZDT starts on the last Sunday of September — the day it happens is
    // a 23-hour day (clocks jump 2am -> 3am), so exactly one consecutive
    // pair of 8am-local instants is 23 hours apart instead of 24.
    const deltaHours = [];
    for (let i = 1; i < firstOfDay.length; i++) {
      deltaHours.push((firstOfDay[i].getTime() - firstOfDay[i - 1].getTime()) / 3_600_000);
    }
    expect(deltaHours.filter((d) => d === 23)).toHaveLength(1);
    expect(deltaHours.filter((d) => d === 24)).toHaveLength(deltaHours.length - 1);
  });

  test("every day's first slot lands on local 8:00am across the April DST end (fall back)", () => {
    const rules = makeRules();
    const from = nzLocalToUtc(2026, 4, 1, 0, 0);
    const to = nzLocalToUtc(2026, 4, 20, 0, 0);
    const { slots } = generateOpenSlots(rules, [], undefined, from, to, FAR_PAST);

    const firstOfDay = firstSlotPerDay(slots);
    for (const slot of firstOfDay) {
      const p = toNzParts(slot);
      expect(p.hour).toBe(8);
      expect(p.minute).toBe(0);
    }

    // NZDT ends on the first Sunday of April — a 25-hour day (clocks fall
    // 3am -> 2am), so exactly one consecutive pair is 25 hours apart.
    const deltaHours = [];
    for (let i = 1; i < firstOfDay.length; i++) {
      deltaHours.push((firstOfDay[i].getTime() - firstOfDay[i - 1].getTime()) / 3_600_000);
    }
    expect(deltaHours.filter((d) => d === 25)).toHaveLength(1);
    expect(deltaHours.filter((d) => d === 24)).toHaveLength(deltaHours.length - 1);
  });
});

describe("generateOpenSlots — grid and exclusions", () => {
  test("only offers slots on configured quote days, at the visitLength+buffer step", () => {
    const rules = makeRules({ quoteDaysOfWeek: [2, 4] }); // Tue, Thu
    const from = nzLocalToUtc(2026, 9, 21, 0, 0); // a Monday
    const to = nzLocalToUtc(2026, 9, 27, 0, 0); // the following Sunday
    const { slots } = generateOpenSlots(rules, [], undefined, from, to, FAR_PAST);

    for (const slot of slots) {
      expect([2, 4]).toContain(toNzParts(slot).weekday);
    }
    // 8:00-16:00 in 60-minute steps (45 visit + 15 buffer) = 8 slots/day, 2 days.
    expect(slots).toHaveLength(16);
  });

  test("excludes slots at/before now, and slots already booked", () => {
    const rules = makeRules({ quoteDaysOfWeek: [2] });
    const tuesday = nzLocalToUtc(2026, 9, 22, 0, 0);
    const nextWeek = nzLocalToUtc(2026, 9, 29, 0, 0);

    const firstSlot = nzLocalToUtc(2026, 9, 22, 8, 0);
    const secondSlot = nzLocalToUtc(2026, 9, 22, 9, 0);

    const { slots: withNow } = generateOpenSlots(rules, [], undefined, tuesday, nextWeek, firstSlot);
    expect(withNow.some((s) => s.getTime() === firstSlot.getTime())).toBe(false);

    const { slots: withBooking } = generateOpenSlots(
      rules,
      [{ startAt: secondSlot }],
      undefined,
      tuesday,
      nextWeek,
      FAR_PAST,
    );
    expect(withBooking.some((s) => s.getTime() === secondSlot.getTime())).toBe(false);
  });

  test("maxVisitsPerQuoteDay caps how many visits a day can have", () => {
    const rules = makeRules({ quoteDaysOfWeek: [2], maxVisitsPerQuoteDay: 1 });
    const tuesday = nzLocalToUtc(2026, 9, 22, 0, 0);
    const nextDay = nzLocalToUtc(2026, 9, 23, 0, 0);
    const existing = [{ startAt: nzLocalToUtc(2026, 9, 22, 8, 0) }];

    const { slots } = generateOpenSlots(rules, existing, undefined, tuesday, nextDay, FAR_PAST);
    expect(slots).toHaveLength(0);
  });
});

describe("service area", () => {
  test("isWithinServiceArea allows everything when no suburbs are configured", () => {
    expect(isWithinServiceArea({ serviceAreaSuburbs: null }, "1 Any St, Nowhereville")).toBe(true);
  });

  test("declines an address outside the configured suburbs", () => {
    const rules = makeRules({ serviceAreaSuburbs: ["Ponsonby", "Grey Lynn"] });
    const { declined, slots } = generateOpenSlots(
      rules,
      [],
      "12 Queen St, Auckland CBD",
      nzLocalToUtc(2026, 9, 22, 0, 0),
      nzLocalToUtc(2026, 9, 24, 0, 0),
      FAR_PAST,
    );
    expect(declined).toBe(true);
    expect(slots).toHaveLength(0);
  });

  test("accepts an address matching a configured suburb", () => {
    const rules = makeRules({ quoteDaysOfWeek: [2], serviceAreaSuburbs: ["Ponsonby"] });
    const { declined, slots } = generateOpenSlots(
      rules,
      [],
      "5 Jervois Rd, Ponsonby, Auckland",
      nzLocalToUtc(2026, 9, 22, 0, 0),
      nzLocalToUtc(2026, 9, 23, 0, 0),
      FAR_PAST,
    );
    expect(declined).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe("clustering", () => {
  test("days with a same-suburb existing booking are returned first", () => {
    const rules = makeRules({ quoteDaysOfWeek: [2, 4] });
    const tuesday = nzLocalToUtc(2026, 9, 22, 0, 0); // has a Ponsonby booking
    const thursday = nzLocalToUtc(2026, 9, 24, 8, 0);
    const existing = [
      { startAt: nzLocalToUtc(2026, 9, 22, 8, 0), propertyAddress: "5 Jervois Rd, Ponsonby" },
    ];

    const { slots } = generateOpenSlots(
      rules,
      existing,
      "10 Richmond Rd, Ponsonby",
      tuesday,
      new Date(thursday.getTime() + 24 * 60 * 60 * 1000),
      FAR_PAST,
    );

    // Tuesday's remaining slots (same suburb as an existing booking) should
    // all come before Thursday's slots.
    const tuesdaySlots = slots.filter((s) => toNzParts(s).day === 22);
    const thursdaySlots = slots.filter((s) => toNzParts(s).day === 24);
    expect(tuesdaySlots.length).toBeGreaterThan(0);
    expect(thursdaySlots.length).toBeGreaterThan(0);
    expect(slots.indexOf(tuesdaySlots[0])).toBeLessThan(slots.indexOf(thursdaySlots[0]));
  });
});
