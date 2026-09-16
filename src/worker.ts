import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type LeadJobPayload, type VisitJobPayload, type QuoteJobPayload,
  type WorkJobPayload,
  type InvoiceJobPayload,
  type SyncJobPayload,
  type OverdueJobPayload } from "@/lib/jobs/queue-names";
import {
  handleSendBookingLink,
  handleNoBookingNudge4h,
  handleNoBookingNudge2d,
  handleMarkCold7d,
  handleSendVisitConfirmation,
  handleSendVisitReminder,
  handleSendQuote,
  handleQuoteFollowUp3d,
  handleQuoteFollowUp7d,
  handleSendJobConfirmation,
  handleSendJobMoved,
  handleSendJobReminder,
} from "@/lib/jobs/handlers";
import { handlePushInvoice, handleSyncXero, handleInvoiceOverdue } from "@/lib/xero/handlers";

/**
 * The background job processor (build-plan M2). Run as its own process,
 * alongside `pnpm dev` locally (`pnpm worker`) and as its own
 * container/service once AWS is wired up — Next.js's request-scoped
 * server can't run a long-lived poller like pg-boss needs.
 */
async function main() {
  const boss = await getQueue();

  await boss.work<LeadJobPayload>(JOB_NAMES.SEND_BOOKING_LINK, (jobs) =>
    Promise.all(jobs.map((job) => handleSendBookingLink(job.data))),
  );
  await boss.work<LeadJobPayload>(JOB_NAMES.NO_BOOKING_NUDGE_4H, (jobs) =>
    Promise.all(jobs.map((job) => handleNoBookingNudge4h(job.data))),
  );
  await boss.work<LeadJobPayload>(JOB_NAMES.NO_BOOKING_NUDGE_2D, (jobs) =>
    Promise.all(jobs.map((job) => handleNoBookingNudge2d(job.data))),
  );
  await boss.work<LeadJobPayload>(JOB_NAMES.MARK_COLD_7D, (jobs) => Promise.all(jobs.map((job) => handleMarkCold7d(job.data))));
  await boss.work<VisitJobPayload>(JOB_NAMES.SEND_VISIT_CONFIRMATION, (jobs) =>
    Promise.all(jobs.map((job) => handleSendVisitConfirmation(job.data))),
  );
  await boss.work<VisitJobPayload>(JOB_NAMES.SEND_VISIT_REMINDER, (jobs) =>
    Promise.all(jobs.map((job) => handleSendVisitReminder(job.data))),
  );
  await boss.work<QuoteJobPayload>(JOB_NAMES.SEND_QUOTE, (jobs) => Promise.all(jobs.map((job) => handleSendQuote(job.data))));
  await boss.work<QuoteJobPayload>(JOB_NAMES.QUOTE_FOLLOW_UP_3D, (jobs) =>
    Promise.all(jobs.map((job) => handleQuoteFollowUp3d(job.data))),
  );
  await boss.work<QuoteJobPayload>(JOB_NAMES.QUOTE_FOLLOW_UP_7D, (jobs) =>
    Promise.all(jobs.map((job) => handleQuoteFollowUp7d(job.data))),
  );
  await boss.work<WorkJobPayload>(JOB_NAMES.SEND_JOB_CONFIRMATION, (jobs) =>
    Promise.all(jobs.map((job) => handleSendJobConfirmation(job.data))),
  );
  await boss.work<WorkJobPayload>(JOB_NAMES.SEND_JOB_MOVED, (jobs) =>
    Promise.all(jobs.map((job) => handleSendJobMoved(job.data))),
  );
  await boss.work<WorkJobPayload>(JOB_NAMES.SEND_JOB_REMINDER, (jobs) =>
    Promise.all(jobs.map((job) => handleSendJobReminder(job.data))),
  );
  await boss.work<InvoiceJobPayload>(JOB_NAMES.PUSH_INVOICE, (jobs) =>
    Promise.all(jobs.map((job) => handlePushInvoice(job.data))),
  );
  await boss.work<SyncJobPayload>(JOB_NAMES.SYNC_XERO, (jobs) => Promise.all(jobs.map((job) => handleSyncXero(job.data))));
  await boss.work<OverdueJobPayload>(JOB_NAMES.INVOICE_OVERDUE, (jobs) =>
    Promise.all(jobs.map((job) => handleInvoiceOverdue(job.data))),
  );

  console.log("Worker started, listening on:", Object.values(JOB_NAMES).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
