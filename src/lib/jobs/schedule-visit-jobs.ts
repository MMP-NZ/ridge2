import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type VisitJobPayload } from "./queue-names";
import { nextDaytimeSendTime } from "@/lib/time";

/** Queued from bookVisit() (src/lib/booking/book.ts) after its transaction commits. */
export async function scheduleVisitJobs(tenantId: string, visitId: string, startAt: Date): Promise<void> {
  const boss = await getQueue();
  const payload: VisitJobPayload = { tenantId, visitId };

  await boss.send(JOB_NAMES.SEND_VISIT_CONFIRMATION, payload);

  // 24h before the visit, nudged into the 8am-8pm NZ window if that lands
  // outside it (CLAUDE.md: non-urgent texts, daytime only).
  const reminderAt = nextDaytimeSendTime(new Date(startAt.getTime() - 24 * 60 * 60 * 1000));
  await boss.send(JOB_NAMES.SEND_VISIT_REMINDER, payload, { startAfter: reminderAt });
}
