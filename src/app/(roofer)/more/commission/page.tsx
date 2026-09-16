import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { getMonthlyStatement, listStatementMonths } from "@/lib/commission/statement";
import { formatNzd } from "@/lib/money";
import { PriceBookIcon } from "@/components/icons";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Screen, SectionHeading } from "@/components/ui";

const SOURCE_LABELS: Record<string, string> = {
  juno_ads: "Juno ads",
  juno_website: "Juno website",
  juno_referral: "Juno referral",
  roofer_own: "Your own lead",
};

const REASON_LABELS: Record<string, string> = {
  juno_sourced: "Juno brought this customer in",
  within_tail: "Repeat work for a customer Juno found, quoted within 12 months",
};

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { month } = await searchParams;
  const selected = month ? new Date(month) : new Date();

  const { statement, months } = await withRooferAccess(session.tenantId, async (tx) => ({
    statement: await getMonthlyStatement(tx, session.tenantId, selected),
    months: await listStatementMonths(tx, session.tenantId),
  }));

  return (
    <Screen>
      <PageHeader
        backHref="/more"
        backLabel="More"
        title="Commission"
        description="6% of what you're paid on work Juno Logic brought you, ex GST, capped at $5,000 a job. Nothing on your own leads."
      />

      {months.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {months.slice(0, 6).map((candidate) => {
            const value = candidate.toISOString();
            const active = candidate.getTime() === statement.month.getTime();
            return (
              <Link
                key={value}
                href={`/more/commission?month=${encodeURIComponent(value)}`}
                className={`inline-flex min-h-11 items-center rounded-pill border px-3.5 text-caption font-semibold ${
                  active ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface"
                }`}
              >
                {new Intl.DateTimeFormat("en-NZ", {
                  month: "short",
                  year: "numeric",
                  timeZone: "Pacific/Auckland",
                }).format(candidate)}
              </Link>
            );
          })}
        </div>
      ) : null}

      {statement.lines.length === 0 ? (
        <EmptyState
          icon={<PriceBookIcon className="h-6 w-6" />}
          title={`Nothing for ${statement.label}`}
          description="Commission appears here once a customer pays an invoice on work Juno Logic brought you."
        />
      ) : (
        <>
          <Card tone="raised" className="flex flex-col gap-2">
            <CardTitle>{statement.label}</CardTitle>
            <dl className="flex flex-col gap-1.5 text-body">
              <div className="flex justify-between">
                <dt className="text-muted">You were paid (ex GST)</dt>
                <dd className="tabular-nums">{formatNzd(statement.totalPaidExGstCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-title font-semibold">
                <dt>Commission</dt>
                <dd className="tabular-nums">{formatNzd(statement.totalCommissionCents)}</dd>
              </div>
            </dl>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeading>Job by job</SectionHeading>
            {statement.lines.map((line) => (
              <Card key={line.jobId} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold">{line.customerName}</p>
                    <p className="mt-0.5 text-caption text-muted">
                      {formatNzd(line.paidExGstCents)} paid · {line.rateBp / 100}%
                    </p>
                  </div>
                  <span className="shrink-0 text-title font-semibold tabular-nums">
                    {formatNzd(line.commissionCents)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="outline">{SOURCE_LABELS[line.source] ?? line.source}</Badge>
                  {line.capped ? <Badge tone="accent-soft">Capped at $5,000</Badge> : null}
                </div>

                {/* Why it counts, not just that it does — he should be able
                    to check the reasoning rather than take a total on faith. */}
                <p className="text-caption text-muted">{REASON_LABELS[line.eligibilityReason] ?? line.eligibilityReason}</p>
              </Card>
            ))}
          </section>

          <Card tone="quiet">
            <p className="text-caption text-muted">
              Juno Logic invoices this separately each month, along with your plan fee and any ad spend at cost. Ad
              spend is passed on with no markup.
            </p>
          </Card>
        </>
      )}
    </Screen>
  );
}
