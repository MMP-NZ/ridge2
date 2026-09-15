import { getQueue } from "@/lib/queue";
import { JOB_NAMES, type WorkJobPayload } from "./queue-names";
import { nextDaytimeSendTime } from "@/lib/time";
import { nzLocalToUtc } from "@/lib/time";
import type { ScheduleOutcome } from "@/lib/scheduling/jobs";
import type { WorkDate } from "@/lib/scheduling/work-days";

/** 7am NZ on the first work day, so "tomorrow" means tomorrow when he reads it. */
function startOfWorkDayUtc(workDate: WorkDate): Date {
  const [year, month, day] = workDate.split("-").map(Number);
  return nzLocalToUtc(year, month, day, 7, 0);
}

/**
 * Queued after the scheduling transaction commits, the same way bookVisit
 * queues its confirmation (M2).
 *
 * The outcome decides what the customer hears: booked earns a confirmation,
 * moved earns the "it's shifted" notice, and re-confirming the same days
 * earns nothing. Build-plan M5 requires a move to notify them exactly once,
 * which is why this is driven by the outcome rather than by the job's
 * status — the status is `scheduled` in both cases.
 *
 * A fresh reminder is queued either way, carrying the date it's for. The
 * stale one from a previous booking isn't cancelled — nothing in this
 * codebase cancels jobs — it just no-ops when it finds the job has moved.
 */
export async function scheduleWorkJobs(
  tenantId: string,
  jobId: string,
  days: WorkDate[],
  outcome: ScheduleOutcome,
): Promise<void> {
  if (outcome === "unchanged" || days.length === 0) return;

  const boss = await getQueue();
  const firstDay = days[0];
  const payload: WorkJobPayload = { tenantId, jobId, forDate: firstDay };

  await boss.send(outcome === "booked" ? JOB_NAMES.SEND_JOB_CONFIRMATION : JOB_NAMES.SEND_JOB_MOVED, payload);

  // The day before the work starts, nudged into daytime hours.
  const reminderAt = nextDaytimeSendTime(new Date(startOfWorkDayUtc(firstDay).getTime() - 24 * 60 * 60 * 1000));
  await boss.send(JOB_NAMES.SEND_JOB_REMINDER, payload, { startAfter: reminderAt });
}
