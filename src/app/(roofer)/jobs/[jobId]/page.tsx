import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { calendarRules as calendarRulesTable } from "@/db/schema";
import { getJobSummary, takenWorkDates, listJobPhotos } from "@/lib/scheduling/jobs";
import { suggestWorkDays, toWorkDate } from "@/lib/scheduling/work-days";
import { mapsSearchUrl } from "@/lib/booking/queries";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { PinIcon } from "@/components/icons";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Screen } from "@/components/ui";
import { JobScheduler } from "./job-scheduler";
import { describeWorkDays } from "../format-days";

const STATUS_LABELS: Record<string, string> = {
  ready_to_schedule: "To book in",
  scheduled: "Booked in",
  done: "Finished",
  cancelled: "Cancelled",
};

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { jobId } = await params;
  const today = toWorkDate(new Date());

  const data = await withRooferAccess(session.tenantId, async (tx) => {
    const summary = await getJobSummary(tx, session.tenantId, jobId);
    if (!summary) return null;

    const [rules] = await tx
      .select()
      .from(calendarRulesTable)
      .where(eq(calendarRulesTable.tenantId, session.tenantId));

    // A job being moved shouldn't have to step around its own days.
    const taken = (await takenWorkDates(tx, session.tenantId, today)).filter(
      (date) => !summary.days.includes(date),
    );

    return {
      summary,
      rules,
      photos: await listJobPhotos(tx, session.tenantId, jobId),
      suggestions: rules
        ? suggestWorkDays(rules, { takenDates: taken, estimatedDays: summary.job.estimatedDays, from: today })
        : [],
    };
  });

  if (!data) notFound();
  const { summary, photos, suggestions, rules } = data;
  const job = summary.job;

  return (
    <Screen>
      <PageHeader
        backHref="/jobs"
        backLabel="Jobs"
        eyebrow="Job"
        title={summary.customerName}
        action={<Badge tone={job.status === "done" ? "accent" : "outline"}>{STATUS_LABELS[job.status]}</Badge>}
      />

      <Card className="flex flex-col gap-2.5">
        <a
          href={mapsSearchUrl(summary.propertyAddress)}
          className="flex items-start gap-2 text-body font-semibold text-accent underline decoration-accent/35 underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{summary.propertyAddress}</span>
        </a>
        <p className="text-caption text-muted">
          {formatNzd(summary.totalIncGstCents)} including GST · {job.estimatedDays}{" "}
          {job.estimatedDays === 1 ? "day" : "days"} of work
        </p>
        {summary.days.length > 0 ? (
          <p className="text-body font-medium">{describeWorkDays(summary.days)}</p>
        ) : null}
      </Card>

      {job.status === "done" ? (
        <Card tone="accent" className="flex flex-col gap-1">
          <p className="text-body font-semibold">
            Finished{job.completedAt ? ` ${formatNzDate(job.completedAt)}` : ""}
          </p>
          {job.completionNotes ? <p className="text-caption text-muted">{job.completionNotes}</p> : null}
          <p className="mt-1 text-caption text-muted">Invoicing through Xero lands in the next milestone.</p>
        </Card>
      ) : null}

      {!rules ? (
        <Card tone="quiet">
          <CardTitle>Set your quote days first</CardTitle>
          <p className="mt-1 text-caption text-muted">
            We work out your work days from your quote days, so there&apos;s nothing to suggest yet.
          </p>
          <LinkButton href="/calendar/settings" variant="secondary" block className="mt-3">
            Quote day settings
          </LinkButton>
        </Card>
      ) : (
        <JobScheduler
          jobId={job.id}
          status={job.status}
          currentDays={summary.days}
          suggestions={suggestions}
          photos={photos.map((p) => ({ id: p.id, caption: p.caption }))}
        />
      )}
    </Screen>
  );
}
