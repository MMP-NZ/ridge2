import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { calendarRules as calendarRulesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listVisits, mapsSearchUrl } from "@/lib/booking/queries";
import { toNzParts, formatNzDate, formatNzDateTime } from "@/lib/time";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const rules = await withRooferAccess(session.tenantId, (tx) =>
    tx.select().from(calendarRulesTable).where(eq(calendarRulesTable.tenantId, session.tenantId)),
  ).then((rows) => rows[0] ?? null);

  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingVisits = await listVisits(session.tenantId, now, twoWeeksOut);

  const days: { date: Date; key: string; isQuoteDay: boolean }[] = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const parts = toNzParts(date);
    days.push({
      date,
      key: `${parts.year}-${parts.month}-${parts.day}`,
      isQuoteDay: rules?.quoteDaysOfWeek.includes(parts.weekday) ?? false,
    });
  }

  const visitsByDay = new Map<string, typeof upcomingVisits>();
  for (const visit of upcomingVisits) {
    const parts = toNzParts(visit.startAt);
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (!visitsByDay.has(key)) visitsByDay.set(key, []);
    visitsByDay.get(key)!.push(visit);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <Link href="/calendar/settings" className="text-sm text-accent underline">
          Settings
        </Link>
      </div>

      {!rules ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Set your quote days in{" "}
          <Link href="/calendar/settings" className="text-accent underline">
            Settings
          </Link>{" "}
          before customers can self-book.
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {days.map(({ date, key, isQuoteDay }) => {
          const dayVisits = visitsByDay.get(key) ?? [];
          const parts = toNzParts(date);
          return (
            <section key={key} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {WEEKDAY_LABELS[parts.weekday]} {formatNzDate(date)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isQuoteDay ? "bg-accent text-white" : "bg-background text-muted"}`}>
                  {isQuoteDay ? "Quote day" : "Work day"}
                </span>
              </div>
              {dayVisits.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {dayVisits.map((visit) => (
                    <li key={visit.id} className="text-sm">
                      <span className="text-muted">{formatNzDateTime(visit.startAt).split(", ").pop()}</span>{" "}
                      {visit.customerName} —{" "}
                      <a href={mapsSearchUrl(visit.propertyAddress)} className="text-accent underline" target="_blank" rel="noreferrer">
                        {visit.propertyAddress}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">No visits</p>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
