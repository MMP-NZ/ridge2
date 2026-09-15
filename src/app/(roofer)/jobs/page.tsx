import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { listReadyToSchedule, listScheduled, listDone, type ScheduledJobSummary } from "@/lib/scheduling/jobs";
import { formatNzd } from "@/lib/money";
import { CalendarIcon, PinIcon } from "@/components/icons";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Screen, SectionHeading } from "@/components/ui";
import { describeWorkDays } from "./format-days";

function JobCard({ summary, action }: { summary: ScheduledJobSummary; action?: string }) {
  return (
    <Link href={`/jobs/${summary.job.id}`} className="block">
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-title font-semibold tracking-[-0.01em]">{summary.customerName}</p>
            <p className="mt-0.5 flex items-start gap-1.5 text-caption text-muted">
              <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{summary.propertyAddress}</span>
            </p>
          </div>
          <span className="shrink-0 text-title font-semibold tabular-nums">
            {formatNzd(summary.totalIncGstCents)}
          </span>
        </div>

        {summary.days.length > 0 ? (
          <p className="flex items-center gap-1.5 text-caption text-accent">
            <CalendarIcon className="h-4 w-4 shrink-0" />
            {describeWorkDays(summary.days)}
          </p>
        ) : (
          <p className="text-caption text-muted">
            {summary.job.estimatedDays} {summary.job.estimatedDays === 1 ? "day" : "days"} of work
          </p>
        )}

        {action ? <Badge tone="outline">{action}</Badge> : null}
      </Card>
    </Link>
  );
}

export default async function JobsPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { ready, scheduled, done } = await withRooferAccess(session.tenantId, async (tx) => ({
    ready: await listReadyToSchedule(tx, session.tenantId),
    scheduled: await listScheduled(tx, session.tenantId),
    done: await listDone(tx, session.tenantId),
  }));

  const nothingAtAll = ready.length === 0 && scheduled.length === 0 && done.length === 0;

  return (
    <Screen>
      <PageHeader
        backHref="/more"
        backLabel="More"
        title="Jobs"
        description={
          ready.length > 0
            ? `${ready.length} ${ready.length === 1 ? "job" : "jobs"} won and waiting to be booked in.`
            : "Work you've won, booked in and finished."
        }
      />

      {nothingAtAll ? (
        <EmptyState
          icon={<CalendarIcon className="h-6 w-6" />}
          title="No jobs yet"
          description="When a customer accepts a quote it lands here, ready to book into your work days."
          action={
            <LinkButton href="/quotes" variant="secondary" block>
              See your quotes
            </LinkButton>
          }
        />
      ) : null}

      {ready.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Ready to schedule</SectionHeading>
          {ready.map((summary) => (
            <JobCard key={summary.job.id} summary={summary} action="Book it in" />
          ))}
        </section>
      ) : null}

      {scheduled.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Booked in</SectionHeading>
          {scheduled.map((summary) => (
            <JobCard key={summary.job.id} summary={summary} />
          ))}
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Finished</SectionHeading>
          {done.map((summary) => (
            <JobCard key={summary.job.id} summary={summary} />
          ))}
        </section>
      ) : null}
    </Screen>
  );
}
