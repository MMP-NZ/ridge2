import { and, desc, eq, gte, lt } from "drizzle-orm";
import { commissionEntries, invoices, jobs, customers, leads, type LeadSource } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { toNzParts, nzLocalToUtc } from "@/lib/time";

export interface StatementLine {
  jobId: string;
  customerName: string;
  source: LeadSource;
  eligibilityReason: string;
  /** Money received on this job within the period, ex GST. */
  paidExGstCents: number;
  commissionCents: number;
  rateBp: number;
  capped: boolean;
}

export interface CommissionStatement {
  /** First day of the month, as a local NZ date. */
  month: Date;
  label: string;
  lines: StatementLine[];
  totalPaidExGstCents: number;
  totalCommissionCents: number;
}

/** The NZ calendar month containing `date`, as a UTC instant range. */
export function nzMonthRange(date: Date): { from: Date; to: Date } {
  const { year, month } = toNzParts(date);
  return {
    from: nzLocalToUtc(year, month, 1, 0, 0),
    to: month === 12 ? nzLocalToUtc(year + 1, 1, 1, 0, 0) : nzLocalToUtc(year, month + 1, 1, 0, 0),
  };
}

/**
 * One month's commission, per job, for the statement both sides see.
 *
 * The spec is explicit that the roofer sees the same numbers Juno Logic
 * does, and that shapes what's shown: every line carries its source and
 * *why* it earned commission, so a roofer can check the reasoning rather
 * than take a total on faith. A bill he can't interrogate is a bill he'll
 * eventually dispute.
 *
 * Entries are grouped by job because the cap is per job — showing them
 * per payment would make a capped job look like an arithmetic error.
 */
export async function getMonthlyStatement(
  tx: AppTx,
  tenantId: string,
  month: Date,
): Promise<CommissionStatement> {
  const { from, to } = nzMonthRange(month);

  const rows = await tx
    .select({
      entry: commissionEntries,
      customerName: customers.name,
      source: leads.source,
      invoiceId: invoices.id,
    })
    .from(commissionEntries)
    .innerJoin(jobs, eq(jobs.id, commissionEntries.jobId))
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .innerJoin(leads, eq(leads.id, jobs.leadId))
    .leftJoin(invoices, eq(invoices.jobId, jobs.id))
    .where(
      and(
        eq(commissionEntries.tenantId, tenantId),
        gte(commissionEntries.createdAt, from),
        lt(commissionEntries.createdAt, to),
      ),
    )
    .orderBy(desc(commissionEntries.createdAt));

  const byJob = new Map<string, StatementLine>();
  for (const row of rows) {
    const existing = byJob.get(row.entry.jobId);
    if (existing) {
      existing.commissionCents += row.entry.amountCents;
      existing.capped ||= row.entry.capped;
      continue;
    }
    byJob.set(row.entry.jobId, {
      jobId: row.entry.jobId,
      customerName: row.customerName,
      source: row.source,
      eligibilityReason: row.entry.eligibilityReason,
      // Derived from the entry rather than the invoice, so the figure
      // shown is the one the commission was actually calculated from.
      paidExGstCents: row.entry.netPaidExGstCents,
      commissionCents: row.entry.amountCents,
      rateBp: row.entry.rateBp,
      capped: row.entry.capped,
    });
  }

  const lines = [...byJob.values()];

  return {
    month: from,
    label: new Intl.DateTimeFormat("en-NZ", { month: "long", year: "numeric", timeZone: "Pacific/Auckland" }).format(from),
    lines,
    totalPaidExGstCents: lines.reduce((sum, line) => sum + line.paidExGstCents, 0),
    totalCommissionCents: lines.reduce((sum, line) => sum + line.commissionCents, 0),
  };
}

/** The months that actually have commission, newest first — so the statement picker only offers real ones. */
export async function listStatementMonths(tx: AppTx, tenantId: string): Promise<Date[]> {
  const rows = await tx
    .select({ createdAt: commissionEntries.createdAt })
    .from(commissionEntries)
    .where(eq(commissionEntries.tenantId, tenantId))
    .orderBy(desc(commissionEntries.createdAt));

  const months = new Map<number, Date>();
  for (const row of rows) {
    const { from } = nzMonthRange(row.createdAt);
    months.set(from.getTime(), from);
  }
  return [...months.values()];
}
