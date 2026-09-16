import { notFound } from "next/navigation";
import { requireStaffSession } from "@/lib/auth/current-session";
import { getClientTenant } from "@/lib/staff/clients";
import { getOnboarding, getMaxHours, MAX_HOURS_BUDGET_MINUTES } from "@/lib/staff/onboarding";
import { getAdsOverview } from "@/lib/ads/queries";
import { getMonthlyStatement } from "@/lib/commission/statement";
import { withStaffTenantAccess } from "@/lib/auth/with-tenant-context";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { CheckIcon } from "@/components/icons";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Screen, SectionHeading } from "@/components/ui";
import { TopUpForm, MaxHoursForm } from "./client-forms";
import { toggleOnboardingStepAction } from "./actions";

export default async function StaffClientPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const session = await requireStaffSession();
  const { tenantId } = await params;

  const tenant = await getClientTenant(tenantId);
  if (!tenant) notFound();

  const [onboarding, maxHours, ads, statement] = await Promise.all([
    getOnboarding(session.staffUserId, tenantId),
    getMaxHours(session.staffUserId, tenantId, new Date()),
    getAdsOverview(tenantId),
    withStaffTenantAccess(session.staffUserId, tenantId, "commission.statement.view", (tx) =>
      getMonthlyStatement(tx, tenantId, new Date()),
    ),
  ]);

  const doneCount = onboarding.filter((step) => step.completedAt).length;

  return (
    <Screen>
      <PageHeader
        backHref="/staff"
        backLabel="Clients"
        eyebrow={tenant.plan === "max" ? "MAX" : "Basic"}
        title={tenant.businessName}
        description={`${formatNzd(tenant.monthlyFeeCents)} a month, ex GST`}
      />

      <Card className="flex flex-col gap-1.5">
        <CardTitle>Key dates</CardTitle>
        <dl className="flex flex-col gap-1 text-caption">
          {[
            ["Free month ends", tenant.freeMonthEndsAt],
            ["Minimum term ends", tenant.minimumTermEndsAt],
            ["Price lock ends", tenant.priceLockEndsAt],
            ["Website becomes his", tenant.websiteOwnershipDate],
          ].map(([label, date]) => (
            <div key={String(label)} className="flex justify-between gap-3">
              <dt className="text-muted">{label as string}</dt>
              <dd>{date ? formatNzDate(date as Date) : "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeading>
          Onboarding · {doneCount} of {onboarding.length}
        </SectionHeading>
        {onboarding.map((step) => (
          <form key={step.key} action={toggleOnboardingStepAction}>
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="stepKey" value={step.key} />
            <input type="hidden" name="done" value={step.completedAt ? "false" : "true"} />
            <button type="submit" className="w-full text-left">
              <Card className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    step.completedAt ? "border-accent bg-accent text-accent-contrast" : "border-border-strong"
                  }`}
                >
                  {step.completedAt ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-medium">{step.label}</span>
                  <span className="block text-caption text-muted">{step.detail}</span>
                </span>
              </Card>
            </button>
          </form>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Advertising</SectionHeading>
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-muted">Ad balance</p>
            <p className="text-title font-semibold tabular-nums">{formatNzd(ads.balanceCents)}</p>
          </div>
          <div className="text-right">
            <p className="text-caption text-muted">Spend this month</p>
            <p className="text-body font-semibold tabular-nums">{formatNzd(ads.spendThisMonthCents)}</p>
          </div>
        </Card>
        <TopUpForm tenantId={tenantId} />
      </section>

      {tenant.plan === "max" ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>MAX hours this month</SectionHeading>
          <Card tone={maxHours.overBudget ? "danger" : "default"} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-title font-semibold tabular-nums">
                {(maxHours.minutesThisMonth / 60).toFixed(1)} h
              </p>
              <p className="text-caption text-muted">of {MAX_HOURS_BUDGET_MINUTES / 60} included</p>
            </div>
            {maxHours.overBudget ? <Badge tone="danger">Over</Badge> : null}
          </Card>
          <MaxHoursForm tenantId={tenantId} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionHeading>Commission this month</SectionHeading>
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-muted">{statement.label}</p>
            <p className="text-title font-semibold tabular-nums">{formatNzd(statement.totalCommissionCents)}</p>
          </div>
          <p className="text-caption text-muted">
            on {formatNzd(statement.totalPaidExGstCents)} paid
          </p>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Data</SectionHeading>
        <Card className="flex flex-col gap-3">
          <p className="text-caption text-muted">
            Everything the platform holds about {tenant.businessName}, as one JSON file. Downloading it is written to
            his access log.
          </p>
          <LinkButton href={`/api/staff/export/${tenantId}`} variant="secondary" block external>
            Download his data
          </LinkButton>
        </Card>
      </section>
    </Screen>
  );
}
