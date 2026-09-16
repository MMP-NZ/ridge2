import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { calendarRules as calendarRulesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listVisits, mapsSearchUrl } from "@/lib/booking/queries";
import { listScheduled } from "@/lib/scheduling/jobs";
import { toWorkDate, isWorkDay } from "@/lib/scheduling/work-days";
import { toNzParts } from "@/lib/time";
import { AlertIcon, PinIcon, SettingsIcon } from "@/components/icons";
import {
  Badge,
  Card,
  LinkButton,
  PageHeader,
  Screen,
  formatNzDayLabel,
  formatNzTime,
} from "@/components/ui";

export default async function CalendarPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const rules = await withRooferAccess(session.tenantId, (tx) =>
    tx
      .select()
      .from(calendarRulesTable)
      .where(eq(calendarRulesTable.tenantId, session.tenantId)),
  ).then((rows) => rows[0] ?? null);

  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingVisits = await listVisits(session.tenantId, now, twoWeeksOut);
  const scheduledJobs = await withRooferAccess(session.tenantId, (tx) => listScheduled(tx, session.tenantId));

  // Work days stop looking empty once the jobs booked into them show up.
  const jobsByDay = new Map<string, typeof scheduledJobs>();
  for (const summary of scheduledJobs) {
    for (const workDate of summary.days) {
      if (!jobsByDay.has(workDate)) jobsByDay.set(workDate, []);
      jobsByDay.get(workDate)!.push(summary);
    }
  }

  const days: { date: Date; key: string; workDate: string; isQuoteDay: boolean; isWorking: boolean }[] = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const parts = toNzParts(date);
    const workDate = toWorkDate(date);
    days.push({
      date,
      key: `${parts.year}-${parts.month}-${parts.day}`,
      workDate,
      isQuoteDay: rules?.quoteDaysOfWeek.includes(parts.weekday) ?? false,
      // Straight from the scheduler's own rule, so the calendar can't claim
      // a day is a work day that the scheduler would never offer — Sundays
      // being the case that gave it away.
      isWorking: rules ? isWorkDay(rules, workDate) : false,
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
    <Screen>
      <PageHeader
        title="Calendar"
        description="The next fortnight. Quote days are when customers can book you in."
        action={
          <LinkButton
            href="/calendar/settings"
            variant="secondary"
            size="sm"
            icon={<SettingsIcon className="h-4 w-4" />}
          >
            Settings
          </LinkButton>
        }
      />

      {!rules ? (
        <Card tone="danger" className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <AlertIcon
              className="mt-0.5 h-5 w-5 shrink-0 text-danger"
              strokeWidth={2}
            />
            <p className="min-w-0 text-body text-foreground">
              You haven&apos;t set your quote days yet — until you do, customers
              can&apos;t book themselves in.
            </p>
          </div>
          <LinkButton href="/calendar/settings" variant="secondary" block>
            Set your quote days
          </LinkButton>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {days.map(({ date, key, workDate, isQuoteDay, isWorking }, index) => {
          const dayVisits = visitsByDay.get(key) ?? [];
          const dayJobs = jobsByDay.get(workDate) ?? [];
          const busy = dayVisits.length > 0 || dayJobs.length > 0;
          return (
            <Card
              key={key}
              as="section"
              padding="none"
              tone={isQuoteDay ? "accent" : "default"}
              className={busy ? "shadow-card" : undefined}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-title font-semibold tracking-[-0.01em]">
                    {index === 0 ? "Today" : formatNzDayLabel(date)}
                  </span>
                  {index === 0 ? (
                    <span className="text-caption text-muted">
                      {formatNzDayLabel(date)}
                    </span>
                  ) : null}
                </div>
                <Badge tone={isQuoteDay ? "accent" : isWorking ? "outline" : "neutral"}>
                  {isQuoteDay ? "Quote day" : isWorking ? "Work day" : "Day off"}
                </Badge>
              </div>

              {busy ? (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                  {dayVisits.map((visit) => (
                    <li
                      key={visit.id}
                      className="flex items-start gap-3 px-4 py-3"
                    >
                      <span className="w-16 shrink-0 text-caption font-bold tabular-nums text-muted">
                        {formatNzTime(visit.startAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-semibold">
                          {visit.customerName}
                        </span>
                        <a
                          href={mapsSearchUrl(visit.propertyAddress)}
                          className="mt-0.5 inline-flex items-start gap-1.5 text-caption text-accent underline decoration-accent/35 underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <PinIcon className="mt-px h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0">
                            {visit.propertyAddress}
                          </span>
                        </a>
                      </span>
                    </li>
                  ))}
                  {dayJobs.map((summary) => (
                    <li key={summary.job.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="w-16 shrink-0 text-caption font-bold text-accent">On site</span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/jobs/${summary.job.id}`} className="block text-body font-semibold">
                          {summary.customerName}
                        </Link>
                        <span className="mt-0.5 block text-caption text-muted">
                          Day {summary.days.indexOf(workDate) + 1} of {summary.days.length}
                          {" · "}
                          {summary.propertyAddress}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border px-4 py-2.5 text-caption text-muted">
                  {isQuoteDay ? "Open for bookings" : isWorking ? "Nothing booked" : "—"}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
