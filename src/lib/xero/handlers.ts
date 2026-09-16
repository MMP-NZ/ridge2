import { and, eq } from "drizzle-orm";
import { withSystemTenantContext } from "@/db/client";
import { invoices, jobs, customers, tenants, leads } from "@/db/schema";
import { formatNzd } from "@/lib/money";
import { sendTransactional } from "@/lib/messaging/send";
import { invoiceOverdueMessage } from "@/lib/messaging/templates";
import { getXeroClient } from "./client";
import { getUsableTokens } from "./connection";
import { pushInvoiceForJob, syncXeroForTenant, applyRemoteInvoice } from "./invoicing";
import type { InvoiceJobPayload, SyncJobPayload, OverdueJobPayload } from "@/lib/jobs/queue-names";

export async function handlePushInvoice(payload: InvoiceJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    await pushInvoiceForJob(tx, payload.tenantId, payload.jobId);
    // Every outcome is either success or a state the roofer resolves
    // himself (not connected, needs reconnect, job not done). None of them
    // is worth failing the queued job over and retrying forever.
  });
}

export async function handleSyncXero(payload: SyncJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    await syncXeroForTenant(tx, payload.tenantId);
  });
}

/**
 * Chases an unpaid invoice at 7, 14 and 21 days past due.
 *
 * The freshness check is the point of this handler. Payments only reach us
 * on a twice-daily poll, so our copy can be up to twelve hours stale — and
 * texting "your invoice is overdue" to somebody who paid this morning is
 * exactly the kind of thing that costs a roofer a customer and makes the
 * platform look stupid. So before sending, this asks Xero about that one
 * invoice and folds in anything it finds.
 *
 * That's a handful of extra API calls a week against a real risk of an
 * embarrassing message, which is a trade worth making every time.
 */
export async function handleInvoiceOverdue(payload: OverdueJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const [row] = await tx
      .select({ invoice: invoices, job: jobs, customer: customers, tenant: tenants, lead: leads })
      .from(invoices)
      .innerJoin(jobs, eq(jobs.id, invoices.jobId))
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .innerJoin(leads, eq(leads.id, jobs.leadId))
      .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
      .where(and(eq(invoices.tenantId, payload.tenantId), eq(invoices.id, payload.invoiceId)));
    if (!row) return;

    // Cheap local checks first — no point calling Xero about a voided one.
    if (row.invoice.status === "paid" || row.invoice.status === "voided" || row.invoice.status === "deleted") return;

    const auth = await getUsableTokens(tx, payload.tenantId);
    if (auth.status !== "ok") return; // Nothing to chase with; he'll reconnect.

    const remote = await getXeroClient().getInvoice(auth.tokens, row.invoice.xeroInvoiceId);
    if (!remote) return;

    // Bring our copy up to date while we're here — this also records any
    // payment we hadn't seen, and the commission that goes with it.
    await applyRemoteInvoice(
      tx,
      payload.tenantId,
      row.invoice,
      remote,
      row.tenant.commissionRateBp,
      row.tenant.commissionCapCents,
    );

    const netPaid = remote.payments.reduce((sum, p) => sum + p.amountExGstCents, 0);
    const owing = remote.totalExGstCents - netPaid;
    if (remote.status === "paid" || remote.status === "voided" || owing <= 0) return;

    const message = invoiceOverdueMessage(
      row.tenant.businessName,
      remote.invoiceNumber,
      formatNzd(owing),
      payload.daysOverdue,
    );

    const templateKey = `invoice_overdue_${payload.daysOverdue}d`;
    if (row.customer.phone) {
      await sendTransactional(tx, {
        tenantId: payload.tenantId,
        customerId: row.customer.id,
        leadId: row.lead.id,
        channel: "sms",
        to: row.customer.phone,
        templateKey,
        body: message.body,
      });
    }
    if (row.customer.email) {
      await sendTransactional(tx, {
        tenantId: payload.tenantId,
        customerId: row.customer.id,
        leadId: row.lead.id,
        channel: "email",
        to: row.customer.email,
        templateKey,
        subject: message.subject,
        body: message.body,
      });
    }
  });
}
