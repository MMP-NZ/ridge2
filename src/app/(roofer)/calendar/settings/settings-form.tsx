"use client";

import { useActionState } from "react";
import { saveCalendarSettingsAction, type CalendarSettingsState } from "./actions";
import type { CalendarRules } from "@/db/schema";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const initialState: CalendarSettingsState = {};

export function CalendarSettingsForm({ existing }: { existing: CalendarRules | null }) {
  const [state, formAction, pending] = useActionState(saveCalendarSettingsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Quote days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label key={day.value} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm">
              <input
                type="checkbox"
                name="quoteDay"
                value={day.value}
                defaultChecked={existing?.quoteDaysOfWeek.includes(day.value) ?? (day.value === 2 || day.value === 4)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="startTime" className="text-sm font-medium">
            Start
          </label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={minutesToHHMM(existing?.quoteHoursStartMin ?? 480)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="endTime" className="text-sm font-medium">
            End
          </label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={minutesToHHMM(existing?.quoteHoursEndMin ?? 960)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="visitLength" className="text-sm font-medium">
            Visit length (min)
          </label>
          <input
            id="visitLength"
            name="visitLength"
            type="number"
            min={5}
            defaultValue={existing?.visitLengthMinutes ?? 45}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="travelBuffer" className="text-sm font-medium">
            Travel buffer (min)
          </label>
          <input
            id="travelBuffer"
            name="travelBuffer"
            type="number"
            min={0}
            defaultValue={existing?.travelBufferMinutes ?? 15}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="maxVisits" className="text-sm font-medium">
          Max visits per quote day <span className="font-normal text-muted">(leave blank for no cap)</span>
        </label>
        <input
          id="maxVisits"
          name="maxVisits"
          type="number"
          min={1}
          defaultValue={existing?.maxVisitsPerQuoteDay ?? ""}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="serviceArea" className="text-sm font-medium">
          Service area suburbs <span className="font-normal text-muted">(comma-separated, leave blank for no limit)</span>
        </label>
        <input
          id="serviceArea"
          name="serviceArea"
          defaultValue={existing?.serviceAreaSuburbs?.join(", ") ?? ""}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
