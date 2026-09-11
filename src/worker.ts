import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type LeadJobPayload, type VisitJobPayload } from "@/lib/jobs/queue-names";
import {
  handleSendBookingLink,
  handleNoBookingNudge4h,
  handleNoBookingNudge2d,
  handleMarkCold7d,
  handleSendVisitConfirmation,
  handleSendVisitReminder,
} from "@/lib/jobs/handlers";

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

  console.log("Worker started, listening on:", Object.values(JOB_NAMES).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
