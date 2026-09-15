import { requireStaffSession } from "@/lib/auth/current-session";
import { previewBillingRun } from "@/lib/billing/run";
import { formatNzd } from "@/lib/money";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Screen, SectionHeading } from "@/components/ui";
import { PriceBookIcon } from "@/components/icons";
import { RunBillingForm } from "./run-form";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireStaffSession();

  const { month } = await searchParams;
  const selected = month ? new Date(month) : new Date();
  const rows = await previewBillingRun(selected);

  const label = new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(selected);

  const billable = rows.filter((row) => !row.alreadyBilled && row.lines.totalExGstCents > 0);
  const total = billable.reduce((sum, row) => sum + row.lines.totalExGstCents, 0);

  return (
    <Screen>
      <PageHeader
        backHref="/staff"
        backLabel="Clients"
        eyebrow={label}
        title="Billing"
        description="Plan fee, commission and ad spend at cost. Nothing is raised until you confirm."
      />

      {rows.length === 0 ? (
        <EmptyState icon={<PriceBookIcon className="h-6 w-6" />} title="No clients to bill" />
      ) : (
        <>
          <Card tone="raised" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>To raise</CardTitle>
              <p className="text-caption text-muted">
                {billable.length} of {rows.length} clients
              </p>
            </div>
            <span className="text-headline font-bold tabular-nums">{formatNzd(total)}</span>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeading>Client by client</SectionHeading>
            {rows.map(({ tenant, lines, alreadyBilled }) => (
              <Card key={tenant.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold">{tenant.businessName}</p>
                    <p className="text-caption text-muted">{tenant.plan === "max" ? "MAX" : "Basic"}</p>
                  </div>
                  <span className="shrink-0 text-title font-semibold tabular-nums">
                    {formatNzd(lines.totalExGstCents)}
                  </span>
                </div>

                <dl className="flex flex-col gap-1 border-t border-border pt-2 text-caption">
                  <div className="flex justify-between">
                    <dt className="text-muted">Plan fee</dt>
                    <dd className="tabular-nums">{formatNzd(lines.planFeeCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Commission</dt>
                    <dd className="tabular-nums">{formatNzd(lines.commissionCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Ad top-ups (at cost)</dt>
                    <dd className="tabular-nums">{formatNzd(lines.adTopUpsCents)}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-1.5">
                  {alreadyBilled ? <Badge tone="neutral">Already billed</Badge> : null}
                  {lines.inFreeMonth ? <Badge tone="warning">Free month — no plan fee</Badge> : null}
                  {lines.priceLocked ? <Badge tone="accent-soft">Founding price</Badge> : null}
                </div>
              </Card>
            ))}
          </section>

          <RunBillingForm month={selected.toISOString()} billableCount={billable.length} />

          <Card tone="quiet">
            <p className="text-caption text-muted">
              Amounts are ex GST. Juno Logic&apos;s own Xero adds GST if Juno Logic is registered — check with the
              accountant before the first real run.
            </p>
          </Card>
        </>
      )}
    </Screen>
  );
}
