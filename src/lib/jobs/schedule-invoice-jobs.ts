import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type InvoiceJobPayload, type OverdueJobPayload } from "./queue-names";
import { nextDaytimeSendTime } from "@/lib/time";

/** Build-plan M6: overdue reminders at 7, 14 and 21 days. */
export const OVERDUE_STAGES = [7, 14, 21] as const;

export async function queueInvoicePush(tenantId: string, jobId: string): Promise<void> {
  const boss = await getQueue();
  const payload: InvoiceJobPayload = { tenantId, jobId };
  await boss.send(JOB_NAMES.PUSH_INVOICE, payload);
}

/**
 * Queues the three chase-ups, measured from the invoice's due date.
 *
 * Nothing is cancelled when the customer pays — as everywhere else in this
 * codebase, the handler re-reads state and stops itself. Here it goes
 * further and re-checks with Xero directly, because our copy of "paid" is
 * only ever as fresh as the last twice-daily sync.
 */
export async function queueOverdueReminders(tenantId: string, invoiceId: string, dueDate: Date): Promise<void> {
  const boss = await getQueue();

  for (const daysOverdue of OVERDUE_STAGES) {
    const payload: OverdueJobPayload = { tenantId, invoiceId, daysOverdue };
    const due = new Date(dueDate.getTime() + daysOverdue * 24 * 60 * 60 * 1000);
    // Daytime only (CLAUDE.md) — a debt chase at 3am reads as harassment.
    await boss.send(JOB_NAMES.INVOICE_OVERDUE, payload, { startAfter: nextDaytimeSendTime(due) });
  }
}

/**
 * The twice-daily poll. Morning and evening NZ time, which is often enough
 * for commission — nobody is waiting on it in real time — and gentle on
 * Xero's rate limits.
 */
export async function scheduleTenantSync(tenantId: string): Promise<void> {
  const boss = await getQueue();
  // pg-boss cron runs in UTC. 19:00 and 07:00 UTC are roughly 7am and 7pm
  // in NZ; the exact hour doesn't matter, only that it's twice a day.
  await boss.schedule(JOB_NAMES.SYNC_XERO, "0 7,19 * * *", { tenantId }, { tz: "UTC" });
}
