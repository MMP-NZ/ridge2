import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type QuoteJobPayload } from "./queue-names";
import { quoteFollowUpScheduleFor } from "./schedule";
import { nextDaytimeSendTime } from "@/lib/time";

/**
 * Queued from the send-quote action after its transaction commits, the
 * same way scheduleVisitJobs is queued from bookVisit (M2).
 *
 * Nothing is cancelled when a customer accepts. This codebase has no job
 * cancellation anywhere — the handlers re-read the quote and stop if it is
 * no longer `sent`, which covers accepted, declined and superseded alike.
 */
export async function scheduleQuoteJobs(tenantId: string, quoteId: string, sentAt: Date): Promise<void> {
  const boss = await getQueue();
  const payload: QuoteJobPayload = { tenantId, quoteId };

  await boss.send(JOB_NAMES.SEND_QUOTE, payload);

  const schedule = quoteFollowUpScheduleFor(sentAt);
  // Nudged into the 8am-8pm NZ window: a chase-up text at 3am reads as
  // desperate, and CLAUDE.md puts non-urgent messages in daytime hours.
  await boss.send(JOB_NAMES.QUOTE_FOLLOW_UP_3D, payload, {
    startAfter: nextDaytimeSendTime(schedule.followUp3d),
  });
  await boss.send(JOB_NAMES.QUOTE_FOLLOW_UP_7D, payload, {
    startAfter: nextDaytimeSendTime(schedule.followUp7d),
  });
}
