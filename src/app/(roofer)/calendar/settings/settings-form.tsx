"use client";

import { useActionState } from "react";
import {
  Button,
  Card,
  CardTitle,
  ChoiceChip,
  Field,
  FormMessage,
  TextInput,
} from "@/components/ui";
import {
  saveCalendarSettingsAction,
  type CalendarSettingsState,
} from "./actions";
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

export function CalendarSettingsForm({
  existing,
}: {
  existing: CalendarRules | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveCalendarSettingsAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-caption font-semibold">Quote days</legend>
          <p className="text-caption text-muted">
            Most roofers pick two. The rest of the week stays free for work.
          </p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <ChoiceChip
                key={day.value}
                type="checkbox"
                name="quoteDay"
                value={day.value}
                defaultChecked={
                  existing?.quoteDaysOfWeek.includes(day.value) ??
                  (day.value === 2 || day.value === 4)
                }
              >
                {day.label}
              </ChoiceChip>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Hours and visit length</CardTitle>

        <div className="flex gap-3">
          <Field label="Start" htmlFor="startTime" className="flex-1">
            <TextInput
              id="startTime"
              name="startTime"
              type="time"
              defaultValue={minutesToHHMM(existing?.quoteHoursStartMin ?? 480)}
            />
          </Field>
          <Field label="End" htmlFor="endTime" className="flex-1">
            <TextInput
              id="endTime"
              name="endTime"
              type="time"
              defaultValue={minutesToHHMM(existing?.quoteHoursEndMin ?? 960)}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field
            label="Visit length"
            hint="min"
            htmlFor="visitLength"
            className="flex-1"
          >
            <TextInput
              id="visitLength"
              name="visitLength"
              type="number"
              inputMode="numeric"
              min={5}
              defaultValue={existing?.visitLengthMinutes ?? 45}
            />
          </Field>
          <Field
            label="Travel buffer"
            hint="min"
            htmlFor="travelBuffer"
            className="flex-1"
          >
            <TextInput
              id="travelBuffer"
              name="travelBuffer"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={existing?.travelBufferMinutes ?? 15}
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Limits</CardTitle>

        <Field
          label="Max visits per quote day"
          hint="(optional)"
          htmlFor="maxVisits"
          help="Leave blank for no cap."
        >
          <TextInput
            id="maxVisits"
            name="maxVisits"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="No cap"
            defaultValue={existing?.maxVisitsPerQuoteDay ?? ""}
          />
        </Field>

        <Field
          label="Service area suburbs"
          hint="(optional)"
          htmlFor="serviceArea"
          help="Comma-separated. Leave blank to take work anywhere."
        >
          <TextInput
            id="serviceArea"
            name="serviceArea"
            placeholder="Papanui, Merivale, St Albans"
            defaultValue={existing?.serviceAreaSuburbs?.join(", ") ?? ""}
          />
        </Field>
      </Card>

      {state.error ? <FormMessage>{state.error}</FormMessage> : null}

      <Button
        type="submit"
        size="lg"
        block
        pending={pending}
        pendingLabel="Saving…"
      >
        Save settings
      </Button>
    </form>
  );
}
