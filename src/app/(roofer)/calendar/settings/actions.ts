"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { upsertCalendarRules } from "@/lib/booking/calendar-rules";

export interface CalendarSettingsState {
  error?: string;
}

function minutesFromHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export async function saveCalendarSettingsAction(
  _prevState: CalendarSettingsState,
  formData: FormData,
): Promise<CalendarSettingsState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const quoteDaysOfWeek = formData
    .getAll("quoteDay")
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);

  const startMin = minutesFromHHMM(String(formData.get("startTime") ?? ""));
  const endMin = minutesFromHHMM(String(formData.get("endTime") ?? ""));
  const visitLength = Number(formData.get("visitLength") ?? 45);
  const travelBuffer = Number(formData.get("travelBuffer") ?? 15);
  const maxVisitsRaw = String(formData.get("maxVisits") ?? "").trim();
  const serviceAreaRaw = String(formData.get("serviceArea") ?? "").trim();

  if (quoteDaysOfWeek.length === 0) {
    return { error: "Pick at least one quote day." };
  }
  if (startMin === null || endMin === null || startMin >= endMin) {
    return { error: "Enter a valid start and end time (e.g. 08:00 and 16:00)." };
  }
  if (!Number.isFinite(visitLength) || visitLength <= 0 || !Number.isFinite(travelBuffer) || travelBuffer < 0) {
    return { error: "Visit length and travel buffer must be positive numbers." };
  }

  await withRooferAccess(session.tenantId, (tx) =>
    upsertCalendarRules(tx, session.tenantId, {
      quoteDaysOfWeek,
      quoteHoursStartMin: startMin,
      quoteHoursEndMin: endMin,
      visitLengthMinutes: visitLength,
      travelBufferMinutes: travelBuffer,
      maxVisitsPerQuoteDay: maxVisitsRaw ? Number(maxVisitsRaw) : null,
      serviceAreaSuburbs: serviceAreaRaw
        ? serviceAreaRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    }),
  );

  revalidatePath("/calendar");
  revalidatePath("/calendar/settings");
  redirect("/calendar");
}
