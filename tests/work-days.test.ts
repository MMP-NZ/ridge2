import { describe, test, expect } from "vitest";
import { suggestWorkDays, isWorkDay, toWorkDate } from "@/lib/scheduling/work-days";

/**
 * Build-plan M5 done-when: "Suggested days never clash with quote days or
 * existing jobs." Pure, so no database is involved.
 */

// Tue + Thu quote days, the default the seed uses and the shape the spec
// describes ("1-2 quote days a week, the rest are work days").
const RULES = { quoteDaysOfWeek: [2, 4] };

describe("which days count as work days", () => {
  test.each([
    ["2026-09-14", true, "Monday"],
    ["2026-09-15", false, "Tuesday — a quote day"],
    ["2026-09-16", true, "Wednesday"],
    ["2026-09-17", false, "Thursday — a quote day"],
    ["2026-09-18", true, "Friday"],
    ["2026-09-19", true, "Saturday — roofers work them"],
    ["2026-09-20", false, "Sunday"],
  ])("%s is %s (%s)", (date, expected) => {
    expect(isWorkDay(RULES, date)).toBe(expected);
  });

  test("a roofer with no quote days still never gets a Sunday", () => {
    expect(isWorkDay({ quoteDaysOfWeek: [] }, "2026-09-20")).toBe(false);
    expect(isWorkDay({ quoteDaysOfWeek: [] }, "2026-09-15")).toBe(true);
  });
});

describe("suggesting days for a job", () => {
  test("never suggests a quote day", () => {
    const runs = suggestWorkDays(RULES, { takenDates: [], estimatedDays: 3, from: "2026-09-14" });

    for (const run of runs) {
      for (const day of run) {
        expect(isWorkDay(RULES, day)).toBe(true);
      }
    }
  });

  test("a three-day job starting Monday skips over the quote days", () => {
    const [first] = suggestWorkDays(RULES, { takenDates: [], estimatedDays: 3, from: "2026-09-14" });

    // Mon 14th, then Tue and Thu are quote days, so Wed 16th and Fri 18th.
    expect(first).toEqual(["2026-09-14", "2026-09-16", "2026-09-18"]);
  });

  test("steps around days that already hold work", () => {
    const runs = suggestWorkDays(RULES, {
      takenDates: ["2026-09-14", "2026-09-16"],
      estimatedDays: 2,
      from: "2026-09-14",
    });

    expect(runs[0]).toEqual(["2026-09-18", "2026-09-19"]);
    for (const run of runs) {
      expect(run).not.toContain("2026-09-14");
      expect(run).not.toContain("2026-09-16");
    }
  });

  test("offers alternatives, each a different starting day", () => {
    const runs = suggestWorkDays(RULES, { takenDates: [], estimatedDays: 1, from: "2026-09-14", count: 3 });

    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run[0])).toEqual(["2026-09-14", "2026-09-16", "2026-09-18"]);
  });

  test("every run is exactly as long as the job needs", () => {
    for (const estimatedDays of [1, 2, 5, 10]) {
      const runs = suggestWorkDays(RULES, { takenDates: [], estimatedDays, from: "2026-09-14" });
      for (const run of runs) expect(run).toHaveLength(estimatedDays);
    }
  });

  test("treats a zero or negative estimate as one day rather than returning nothing", () => {
    expect(suggestWorkDays(RULES, { takenDates: [], estimatedDays: 0, from: "2026-09-14" })[0]).toHaveLength(1);
  });

  test("gives up rather than suggesting beyond the horizon", () => {
    // Every work day inside the horizon is taken.
    const taken: string[] = [];
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 8, 14 + i));
      taken.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
    }

    expect(suggestWorkDays(RULES, { takenDates: taken, estimatedDays: 2, from: "2026-09-14", horizonDays: 40 })).toEqual([]);
  });
});

describe("daylight saving", () => {
  // NZDT starts on the last Sunday of September — 27 Sep 2026 — and a naive
  // implementation adding 24-hour chunks drifts an hour and lands on the
  // wrong calendar day. Work dates are plain calendar dates precisely so
  // this can't happen.
  test("runs across the September transition stay on consecutive calendar days", () => {
    const [run] = suggestWorkDays(RULES, { takenDates: [], estimatedDays: 3, from: "2026-09-25" });

    // Fri 25th, Sat 26th, Sun 27th is skipped, Mon 28th.
    expect(run).toEqual(["2026-09-25", "2026-09-26", "2026-09-28"]);
  });

  test("and across the April transition back to NZST", () => {
    // NZST resumes Sunday 5 April 2026.
    const [run] = suggestWorkDays(RULES, { takenDates: [], estimatedDays: 3, from: "2026-04-03" });

    expect(run).toEqual(["2026-04-03", "2026-04-04", "2026-04-06"]);
  });

  test("toWorkDate reads an instant as the NZ calendar day it falls on", () => {
    // 11:30am UTC on 6 Oct is already the 7th in NZ (UTC+13 in daylight time).
    expect(toWorkDate(new Date("2026-10-06T11:30:00Z"))).toBe("2026-10-07");
    // An hour before NZ midnight on the same date.
    expect(toWorkDate(new Date("2026-10-06T10:30:00Z"))).toBe("2026-10-06");
  });
});
