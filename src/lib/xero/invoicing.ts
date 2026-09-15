import { and, asc, eq } from "drizzle-orm";
import {
  invoices,
  invoicePayments,
  commissionEntries,
  jobs,
  quotes,
  quoteLines,
  customers,
  leads,
  tenants,
  xeroConnections,
  type Invoice,
} from "@/db/schema";
import type { AppTx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { getXeroClient } from "./client";
import { getUsableTokens } from "./connection";
import { applyPayment, EMPTY_COMMISSION_STATE, type CommissionState } from "@/lib/commission/calculate";
import { assessEligibility, isJunoSourced } from "@/lib/commission/eligibility";
import type { XeroInvoice } from "./types";

const DUE_DAYS = 14;

export type PushInvoiceResult =
  | { status: "created"; invoice: Invoice }
  | { status: "already_invoiced"; invoice: Invoice }
  | { status: "needs_reconnect" }
  | { status: "not_connected" }
  | { status: "job_not_done" };

/**
 * Raises a draft invoice in the roofer's Xero for a finished job, built
 * from the quote the customer accepted — so what they're billed matches
 * what they agreed to, line for line.
 *
 * A draft, never approved: CLAUDE.md locks it, and the roofer wants the
 * last look before anything reaches his customer.
 *
 * `invoices.job_id` is UNIQUE, so a second push can't raise a second
 * invoice even if two requests race.
 */
export async function pushInvoiceForJob(tx: AppTx, tenantId: string, jobId: string): Promise<PushInvoiceResult> {
  const [existing] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.jobId, jobId)));
  if (existing) return { status: "already_invoiced", invoice: existing };

  const [row] = await tx
    .select({ job: jobs, quote: quotes, customer: customers })
    .from(jobs)
    .innerJoin(quotes, eq(quotes.id, jobs.quoteId))
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));
  if (!row) throw new Error("Job not found");
  if (row.job.status !== "done") return { status: "job_not_done" };

  const auth = await getUsableTokens(tx, tenantId);
  if (auth.status !== "ok") return { status: auth.status };

  const lines = await tx
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.tenantId, tenantId), eq(quoteLines.quoteId, row.quote.id)))
    .orderBy(asc(quoteLines.sortOrder));

  const client = getXeroClient();
  const created = await client.createDraftInvoice(auth.tokens, {
    contact: {
      name: row.customer.name,
      email: row.customer.email ?? undefined,
      phone: row.customer.phone ?? undefined,
    },
    reference: row.quote.quoteToken.slice(0, 12),
    dueDate: new Date(Date.now() + DUE_DAYS * 24 * 60 * 60 * 1000),
    lines: lines.map((line) => ({
      description: line.description,
      quantityThousandths: line.quantityThousandths,
      unitPriceCents: line.unitPriceCents,
    })),
  });

  try {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        tenantId,
        jobId,
        xeroInvoiceId: created.xeroInvoiceId,
        invoiceNumber: created.invoiceNumber,
        status: created.status,
        totalExGstCents: created.totalExGstCents,
        totalIncGstCents: created.totalIncGstCents,
        dueDate: created.dueDate ? created.dueDate.toISOString().slice(0, 10) : null,
        sentAt: new Date(),
        lastSyncedAt: new Date(),
      })
      .returning();
    return { status: "created", invoice };
  } catch (err) {
    // Lost a race with another push. The Xero draft we just made is a
    // duplicate — worth knowing about, but not worth failing the request
    // over, and the roofer can delete it in Xero.
    if (isUniqueViolation(err)) {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.jobId, jobId)));
      return { status: "already_invoiced", invoice };
    }
    throw err;
  }
}

/**
 * Works out whether a job earns commission, and why.
 *
 * The tail lookup is the interesting half: a job the roofer booked himself
 * still counts if this customer originally came from Juno and the quote
 * went out inside the window, so we need the customer's *earliest*
 * Juno-sourced lead, not this job's lead.
 */
async function eligibilityForJob(tx: AppTx, tenantId: string, jobId: string) {
  const [row] = await tx
    .select({ job: jobs, quote: quotes, lead: leads })
    .from(jobs)
    .innerJoin(quotes, eq(quotes.id, jobs.quoteId))
    .innerJoin(leads, eq(leads.id, jobs.leadId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));
  if (!row) throw new Error("Job not found");

  const customerLeads = await tx
    .select({ source: leads.source, createdAt: leads.createdAt })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.customerId, row.job.customerId)))
    .orderBy(asc(leads.createdAt));

  const earliestJuno = customerLeads.find((lead) => isJunoSourced(lead.source));

  return assessEligibility({
    jobLeadSource: row.lead.source,
    quotedAt: row.quote.sentAt ?? row.quote.createdAt,
    earliestJunoLeadAt: earliestJuno?.createdAt ?? null,
  });
}

/** The job's commission position so far, replayed from its recorded entries. */
async function currentCommissionState(tx: AppTx, tenantId: string, jobId: string): Promise<CommissionState> {
  const rows = await tx
    .select()
    .from(commissionEntries)
    .where(and(eq(commissionEntries.tenantId, tenantId), eq(commissionEntries.jobId, jobId)))
    .orderBy(asc(commissionEntries.createdAt));

  const last = rows.at(-1);
  return last
    ? { netPaidExGstCents: last.netPaidExGstCents, commissionCents: last.runningCommissionCents }
    : EMPTY_COMMISSION_STATE;
}

export interface SyncResult {
  invoicesSeen: number;
  paymentsRecorded: number;
  commissionEntriesCreated: number;
  commissionCents: number;
}

/**
 * Pulls everything that changed in Xero since the last watermark, records
 * any new payments, and turns the eligible ones into commission.
 *
 * Runs twice a day, so the same payment is seen repeatedly — the unique
 * `xeroPaymentId` is what makes that safe, and it's the database rather
 * than this function that guarantees a roofer is never charged twice for
 * the same money.
 */
export async function syncXeroForTenant(tx: AppTx, tenantId: string): Promise<SyncResult | { status: "needs_reconnect" | "not_connected" }> {
  const auth = await getUsableTokens(tx, tenantId);
  if (auth.status !== "ok") return { status: auth.status };

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  const client = getXeroClient();

  const [connection] = await tx
    .select()
    .from(xeroConnections)
    .where(eq(xeroConnections.tenantId, tenantId));

  const remote = await client.getInvoicesUpdatedSince(auth.tokens, connection?.lastSyncedAt ?? null);

  const result: SyncResult = {
    invoicesSeen: remote.length,
    paymentsRecorded: 0,
    commissionEntriesCreated: 0,
    commissionCents: 0,
  };

  for (const xeroInvoice of remote) {
    const [local] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.xeroInvoiceId, xeroInvoice.xeroInvoiceId)));
    // Invoices raised outside Ridge aren't ours to track or charge on.
    if (!local) continue;

    const recorded = await applyRemoteInvoice(tx, tenantId, local, xeroInvoice, tenant.commissionRateBp, tenant.commissionCapCents);
    result.paymentsRecorded += recorded.paymentsRecorded;
    result.commissionEntriesCreated += recorded.commissionEntriesCreated;
    result.commissionCents += recorded.commissionCents;
  }

  await tx
    .update(xeroConnections)
    .set({ lastSyncedAt: new Date() })
    .where(eq(xeroConnections.tenantId, tenantId));

  return result;
}

/** Records one remote invoice's new payments and their commission. */
export async function applyRemoteInvoice(
  tx: AppTx,
  tenantId: string,
  local: Invoice,
  remote: XeroInvoice,
  rateBp: number,
  capCents: number,
): Promise<{ paymentsRecorded: number; commissionEntriesCreated: number; commissionCents: number }> {
  const existing = await tx
    .select({ xeroPaymentId: invoicePayments.xeroPaymentId })
    .from(invoicePayments)
    .where(and(eq(invoicePayments.tenantId, tenantId), eq(invoicePayments.invoiceId, local.id)));
  const seen = new Set(existing.map((p) => p.xeroPaymentId));

  const fresh = remote.payments.filter((payment) => !seen.has(payment.xeroPaymentId));

  const eligibility = fresh.length > 0 ? await eligibilityForJob(tx, tenantId, local.jobId) : null;
  let state = await currentCommissionState(tx, tenantId, local.jobId);

  let commissionEntriesCreated = 0;
  let commissionCents = 0;

  for (const payment of fresh) {
    const [row] = await tx
      .insert(invoicePayments)
      .values({
        tenantId,
        invoiceId: local.id,
        xeroPaymentId: payment.xeroPaymentId,
        kind: payment.kind,
        amountExGstCents: payment.amountExGstCents,
        paidAt: payment.paidAt,
      })
      .returning();

    if (!eligibility?.eligible) continue;

    const applied = applyPayment(state, payment.amountExGstCents, rateBp, capCents);
    state = applied.state;

    await tx.insert(commissionEntries).values({
      tenantId,
      jobId: local.jobId,
      invoicePaymentId: row.id,
      amountCents: applied.entryCents,
      rateBp,
      capCents,
      netPaidExGstCents: applied.state.netPaidExGstCents,
      runningCommissionCents: applied.state.commissionCents,
      capped: applied.capped,
      eligibilityReason: eligibility.reason,
    });

    commissionEntriesCreated += 1;
    commissionCents += applied.entryCents;
  }

  const netPaidExGstCents = remote.payments.reduce((sum, p) => sum + p.amountExGstCents, 0);
  await tx
    .update(invoices)
    .set({
      status: remote.status,
      invoiceNumber: remote.invoiceNumber,
      totalExGstCents: remote.totalExGstCents,
      totalIncGstCents: remote.totalIncGstCents,
      netPaidExGstCents,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, local.id)));

  return { paymentsRecorded: fresh.length, commissionEntriesCreated, commissionCents };
}
