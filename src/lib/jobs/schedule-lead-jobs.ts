import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type LeadJobPayload } from "./queue-names";
import { followUpScheduleFor } from "./schedule";

/**
 * Queues the whole no-booking follow-up sequence for a freshly created
 * lead. Called by the createLead() call sites (src/lib/crm/intake.ts,
 * src/app/(roofer)/leads/actions.ts) AFTER their transaction commits —
 * queuing is not itself transactional with the lead insert, so it must
 * only happen once the lead is durably there.
 */
export async function scheduleLeadFollowUps(tenantId: string, leadId: string, createdAt: Date): Promise<void> {
  const boss = await getQueue();
  const schedule = followUpScheduleFor(createdAt);
  const payload: LeadJobPayload = { tenantId, leadId };

  await boss.send(JOB_NAMES.SEND_BOOKING_LINK, payload);
  await boss.send(JOB_NAMES.NO_BOOKING_NUDGE_4H, payload, { startAfter: schedule.nudge4h });
  await boss.send(JOB_NAMES.NO_BOOKING_NUDGE_2D, payload, { startAfter: schedule.nudge2d });
  await boss.send(JOB_NAMES.MARK_COLD_7D, payload, { startAfter: schedule.markCold7d });
}
