import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { countNewLeads, countLeadsNeedingCall } from "@/lib/crm/queries";
import { listVisits, mapsSearchUrl } from "@/lib/booking/queries";
import { formatNzDayLabel, formatNzTime } from "@/components/ui/format";
import {
  CalendarIcon,
  ClockIcon,
  PhoneIcon,
  PinIcon,
} from "@/components/icons";
import {
  Badge,
  Card,
  CountBadge,
  EmptyState,
  LinkButton,
  NavRow,
  PageHeader,
  Screen,
  SectionHeading,
  StatTile,
} from "@/components/ui";

export default async function TodayPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [newLeadCount, needsCallCount, todaysVisits] = await Promise.all([
    countNewLeads(session.tenantId),
    countLeadsNeedingCall(session.tenantId),
    listVisits(session.tenantId, now, endOfDay),
  ]);

  return (
    <Screen>
      <PageHeader
        title="Today"
        eyebrow={formatNzDayLabel(now)}
        description={
          todaysVisits.length === 0
            ? "Nothing booked in. A good day to chase the leads waiting on you."
            : `${todaysVisits.length} ${todaysVisits.length === 1 ? "visit" : "visits"} to get through.`
        }
      />

      {needsCallCount > 0 ? (
        <StatTile
          label="Needs a call"
          value={needsCallCount}
          hint="Nobody has booked a time — give them a ring."
          tone="danger"
          href="/leads?stage=new"
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading>Today&apos;s visits</SectionHeading>

        {todaysVisits.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="h-6 w-6" />}
            title="No visits booked"
            description="Quote visits customers book online land here, in the order you'll drive them."
            action={
              <LinkButton href="/calendar" variant="secondary" block>
                Open the calendar
              </LinkButton>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {todaysVisits.map((visit) => {
              const done = visit.status === "completed";
              return (
                <Card
                  as="li"
                  key={visit.id}
                  padding="none"
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex w-16 shrink-0 flex-col items-center rounded-field bg-accent-soft px-1 py-2 text-accent">
                      <ClockIcon className="h-4 w-4" />
                      <span className="mt-1 text-caption font-bold tabular-nums">
                        {formatNzTime(visit.startAt)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-title font-semibold tracking-[-0.01em]">
                          {visit.customerName}
                        </p>
                        {done ? (
                          <Badge tone="accent-soft">Written up</Badge>
                        ) : null}
                      </div>
                      <a
                        href={mapsSearchUrl(visit.propertyAddress)}
                        className="mt-1 inline-flex items-start gap-1.5 text-body text-accent underline decoration-accent/35 underline-offset-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">{visit.propertyAddress}</span>
                      </a>
                    </div>
                  </div>

                  <div className="border-t border-border p-3">
                    <LinkButton
                      href={`/visits/${visit.id}/capture`}
                      variant={done ? "secondary" : "primary"}
                      size="md"
                      block
                    >
                      {done ? "View the visit" : "Write up the visit"}
                    </LinkButton>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Your pipeline</SectionHeading>
        <NavRow
          href="/leads?stage=new"
          icon={<PhoneIcon className="h-5 w-5" />}
          title="Leads waiting"
          description="New enquiries you haven't moved on yet"
          trailing={
            <CountBadge
              value={newLeadCount}
              tone={newLeadCount > 0 ? "accent" : "neutral"}
            />
          }
        />
      </section>
    </Screen>
  );
}
