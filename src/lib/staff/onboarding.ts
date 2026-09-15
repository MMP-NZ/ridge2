import { and, eq } from "drizzle-orm";
import { onboardingSteps, maxHoursEntries } from "@/db/schema";
import { withStaffTenantAccess } from "@/lib/auth/with-tenant-context";
import { periodMonthKey } from "@/lib/billing/run";

/**
 * The onboarding checklist, in code rather than in a table.
 *
 * Only completed steps get a row, so adding a step here doesn't need a
 * migration or a backfill across every existing client — it just appears,
 * unticked, on everyone who hasn't done it.
 *
 * The order is roughly the order they happen in, and the list is the spec's
 * own description of what Juno Logic does for a new roofer.
 */
export const ONBOARDING_STEPS = [
  { key: "agreement", label: "Agreement signed", detail: "Plan, price and minimum term confirmed" },
  { key: "website", label: "Website live", detail: "Built, copy approved, enquiry form posting to the platform" },
  { key: "price_book", label: "Price book built", detail: "His real rates, not the starter list" },
  { key: "calendar", label: "Quote days set", detail: "Days, hours, visit length and service area" },
  { key: "xero", label: "Xero connected", detail: "Invoices can reach his own accounts" },
  { key: "meta", label: "Meta page connected", detail: "Lead ads can feed straight into booking" },
  { key: "ad_balance", label: "First ad top-up recorded", detail: "Prepaid, so campaigns can start" },
  { key: "walkthrough", label: "Walked through the app", detail: "Today, leads, quoting and the booking link" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export interface OnboardingState {
  key: string;
  label: string;
  detail: string;
  completedAt: Date | null;
}

export async function getOnboarding(staffUserId: string, tenantId: string): Promise<OnboardingState[]> {
  return withStaffTenantAccess(staffUserId, tenantId, "onboarding.view", async (tx) => {
    const done = await tx.select().from(onboardingSteps).where(eq(onboardingSteps.tenantId, tenantId));
    const byKey = new Map(done.map((step) => [step.stepKey, step.completedAt]));

    return ONBOARDING_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      detail: step.detail,
      completedAt: byKey.get(step.key) ?? null,
    }));
  });
}

export async function setOnboardingStep(
  staffUserId: string,
  tenantId: string,
  stepKey: string,
  done: boolean,
): Promise<void> {
  await withStaffTenantAccess(
    staffUserId,
    tenantId,
    done ? "onboarding.complete" : "onboarding.reopen",
    async (tx) => {
      if (!done) {
        await tx
          .delete(onboardingSteps)
          .where(and(eq(onboardingSteps.tenantId, tenantId), eq(onboardingSteps.stepKey, stepKey)));
        return;
      }
      await tx
        .insert(onboardingSteps)
        .values({ tenantId, stepKey, staffUserId })
        // Ticking an already-ticked step shouldn't fail or move the date.
        .onConflictDoNothing();
    },
    { stepKey },
  );
}

/** CLAUDE.md: MAX clients get 4 real hours a month. Over that, Juno Logic looks at it. */
export const MAX_HOURS_BUDGET_MINUTES = 4 * 60;

export interface MaxHoursSummary {
  minutesThisMonth: number;
  overBudget: boolean;
  entries: Array<{ id: string; minutes: number; note: string | null; createdAt: Date }>;
}

export async function getMaxHours(staffUserId: string, tenantId: string, month: Date): Promise<MaxHoursSummary> {
  const periodMonth = periodMonthKey(month);

  return withStaffTenantAccess(staffUserId, tenantId, "max_hours.view", async (tx) => {
    const entries = await tx
      .select()
      .from(maxHoursEntries)
      .where(and(eq(maxHoursEntries.tenantId, tenantId), eq(maxHoursEntries.periodMonth, periodMonth)));

    const minutesThisMonth = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    return {
      minutesThisMonth,
      overBudget: minutesThisMonth > MAX_HOURS_BUDGET_MINUTES,
      entries: entries.map((e) => ({ id: e.id, minutes: e.minutes, note: e.note, createdAt: e.createdAt })),
    };
  });
}

export async function logMaxHours(
  staffUserId: string,
  tenantId: string,
  month: Date,
  minutes: number,
  note?: string,
): Promise<void> {
  await withStaffTenantAccess(
    staffUserId,
    tenantId,
    "max_hours.log",
    async (tx) => {
      await tx.insert(maxHoursEntries).values({
        tenantId,
        periodMonth: periodMonthKey(month),
        minutes,
        note,
        staffUserId,
      });
    },
    { minutes },
  );
}
