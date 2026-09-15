import { and, eq, gte, lt, sum } from "drizzle-orm";
import {
  tenants,
  commissionEntries,
  adBalanceEntries,
  platformInvoices,
  type Tenant,
  type PlatformInvoice,
} from "@/db/schema";
import { withStaffTenantContext, type AppTx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { calculateBilling, type BillingLines } from "./calculate";
import { nzMonthRange } from "@/lib/commission/statement";
import { toNzParts } from "@/lib/time";

export interface BillingPreviewRow {
  tenant: Tenant;
  lines: BillingLines;
  /** Set when this month has already been billed — the run skips it. */
  alreadyBilled: PlatformInvoice | null;
}

/**
 * First day of the NZ month, as the `date` string stored on
 * platform_invoices.
 *
 * Built from the NZ calendar parts, not from `.toISOString()` on the
 * instant. `nzMonthRange().from` is NZ midnight on the 1st, which in UTC is
 * midday on the *last day of the previous month* — so an ISO slice files
 * September's invoices under 31 August, against the wrong month and the
 * wrong unique key. Third time this codebase has been bitten by converting
 * an NZ-local instant back through UTC; see the job-message dates.
 */
export function periodMonthKey(month: Date): string {
  const { year, month: monthNumber } = toNzParts(nzMonthRange(month).from);
  return `${year}-${String(monthNumber).padStart(2, "0")}-01`;
}

async function sumCents(tx: AppTx, query: Promise<Array<{ total: string | null }>>): Promise<number> {
  const [row] = await query;
  return Number(row?.total ?? 0);
}

/**
 * What every roofer would be billed for a month, without billing anyone.
 *
 * The preview is the point of the staff-triggered design: a person looks at
 * the numbers before any of it reaches a customer's accounts. It reads
 * across every tenant, so it runs in a staff context rather than through
 * withStaffTenantAccess — the per-tenant audit rows are written when
 * someone actually opens a client, not for a figure on a summary screen.
 */
export async function previewBillingRun(month: Date): Promise<BillingPreviewRow[]> {
  const { from, to } = nzMonthRange(month);
  const periodMonth = periodMonthKey(month);

  return withStaffTenantContext(NIL_TENANT, async (tx) => {
    const allTenants = await tx.select().from(tenants).orderBy(tenants.businessName);
    const rows: BillingPreviewRow[] = [];

    for (const tenant of allTenants) {
      const commissionCents = await sumCents(
        tx,
        tx
          .select({ total: sum(commissionEntries.amountCents) })
          .from(commissionEntries)
          .where(
            and(
              eq(commissionEntries.tenantId, tenant.id),
              gte(commissionEntries.createdAt, from),
              lt(commissionEntries.createdAt, to),
            ),
          ),
      );

      const adTopUpsCents = await sumCents(
        tx,
        tx
          .select({ total: sum(adBalanceEntries.amountCents) })
          .from(adBalanceEntries)
          .where(
            and(
              eq(adBalanceEntries.tenantId, tenant.id),
              eq(adBalanceEntries.type, "topup"),
              gte(adBalanceEntries.createdAt, from),
              lt(adBalanceEntries.createdAt, to),
            ),
          ),
      );

      const [alreadyBilled] = await tx
        .select()
        .from(platformInvoices)
        .where(and(eq(platformInvoices.tenantId, tenant.id), eq(platformInvoices.periodMonth, periodMonth)));

      rows.push({
        tenant,
        lines: calculateBilling({
          periodMonth: from,
          plan: tenant.plan,
          monthlyFeeCents: tenant.monthlyFeeCents,
          freeMonthEndsAt: tenant.freeMonthEndsAt,
          priceLockEndsAt: tenant.priceLockEndsAt,
          commissionCents,
          adTopUpsCents,
        }),
        alreadyBilled: alreadyBilled ?? null,
      });
    }

    return rows;
  });
}

export interface BillingRunResult {
  raised: PlatformInvoice[];
  skippedAlreadyBilled: number;
  skippedNothingOwing: number;
}

/**
 * Records the month's invoices after a staff member has looked at the
 * preview and confirmed.
 *
 * Two kinds of skip, both deliberate. A month already billed is left alone —
 * `UNIQUE(tenant_id, period_month)` backs that up in the database, because
 * billing a customer twice is the worst thing this function could do. And a
 * roofer who owes nothing at all (free month, no commission, no top-ups)
 * gets no invoice rather than a $0.00 one, which would only prompt a
 * confused phone call.
 */
export async function runBilling(month: Date): Promise<BillingRunResult> {
  const preview = await previewBillingRun(month);
  const periodMonth = periodMonthKey(month);

  const result: BillingRunResult = { raised: [], skippedAlreadyBilled: 0, skippedNothingOwing: 0 };

  for (const row of preview) {
    if (row.alreadyBilled) {
      result.skippedAlreadyBilled += 1;
      continue;
    }
    if (row.lines.totalExGstCents <= 0) {
      result.skippedNothingOwing += 1;
      continue;
    }

    try {
      const invoice = await withStaffTenantContext(row.tenant.id, async (tx) => {
        const [created] = await tx
          .insert(platformInvoices)
          .values({
            tenantId: row.tenant.id,
            periodMonth,
            planFeeCents: row.lines.planFeeCents,
            commissionCents: row.lines.commissionCents,
            adTopUpsCents: row.lines.adTopUpsCents,
            totalExGstCents: row.lines.totalExGstCents,
          })
          .returning();
        return created;
      });
      result.raised.push(invoice);
    } catch (err) {
      // Someone else ran the same month at the same moment.
      if (isUniqueViolation(err)) {
        result.skippedAlreadyBilled += 1;
        continue;
      }
      throw err;
    }
  }

  return result;
}

/**
 * A staff context needs *some* tenant id for `SET LOCAL app.tenant_id`, but
 * the staff policy ignores it — cross-tenant reads are the whole point.
 * Using an explicit nil UUID says that out loud rather than passing a real
 * tenant's id and implying a scope that isn't there.
 */
const NIL_TENANT = "00000000-0000-0000-0000-000000000000";
