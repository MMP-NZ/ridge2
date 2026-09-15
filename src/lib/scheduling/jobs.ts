import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import {
  jobs,
  jobDays,
  jobPhotos,
  quotes,
  customers,
  properties,
  type Job,
  type JobPhoto,
} from "@/db/schema";
import type { AppTx } from "@/db/client";
import { getPhotoStore } from "@/lib/photos/store";
import type { WorkDate } from "./work-days";

export interface ScheduledJobSummary {
  job: Job;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  propertyAddress: string;
  totalIncGstCents: number;
  days: WorkDate[];
}

async function daysByJob(tx: AppTx, tenantId: string, jobIds: string[]): Promise<Map<string, WorkDate[]>> {
  const grouped = new Map<string, WorkDate[]>();
  if (jobIds.length === 0) return grouped;

  const rows = await tx
    .select()
    .from(jobDays)
    .where(and(eq(jobDays.tenantId, tenantId), inArray(jobDays.jobId, jobIds)))
    .orderBy(asc(jobDays.workDate));

  for (const row of rows) {
    if (!grouped.has(row.jobId)) grouped.set(row.jobId, []);
    grouped.get(row.jobId)!.push(row.workDate);
  }
  return grouped;
}

async function listJobsWhere(tx: AppTx, tenantId: string, status: Job["status"]): Promise<ScheduledJobSummary[]> {
  const rows = await tx
    .select({
      job: jobs,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      propertyAddress: properties.address,
      totalIncGstCents: quotes.totalIncGstCents,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .innerJoin(properties, eq(properties.id, jobs.propertyId))
    .innerJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.status, status)))
    .orderBy(desc(jobs.createdAt));

  const grouped = await daysByJob(tx, tenantId, rows.map((r) => r.job.id));
  return rows.map((row) => ({ ...row, days: grouped.get(row.job.id) ?? [] }));
}

/** Work he's won but hasn't booked in — the list the milestone exists to empty. */
export function listReadyToSchedule(tx: AppTx, tenantId: string): Promise<ScheduledJobSummary[]> {
  return listJobsWhere(tx, tenantId, "ready_to_schedule");
}

export function listScheduled(tx: AppTx, tenantId: string): Promise<ScheduledJobSummary[]> {
  return listJobsWhere(tx, tenantId, "scheduled");
}

export function listDone(tx: AppTx, tenantId: string): Promise<ScheduledJobSummary[]> {
  return listJobsWhere(tx, tenantId, "done");
}

export async function getJobSummary(tx: AppTx, tenantId: string, jobId: string): Promise<ScheduledJobSummary | null> {
  const [row] = await tx
    .select({
      job: jobs,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      propertyAddress: properties.address,
      totalIncGstCents: quotes.totalIncGstCents,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .innerJoin(properties, eq(properties.id, jobs.propertyId))
    .innerJoin(quotes, eq(quotes.id, jobs.quoteId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));
  if (!row) return null;

  const grouped = await daysByJob(tx, tenantId, [row.job.id]);
  return { ...row, days: grouped.get(row.job.id) ?? [] };
}

/** Every day already holding work, so the suggester can step around them. */
export async function takenWorkDates(tx: AppTx, tenantId: string, from: WorkDate): Promise<WorkDate[]> {
  const rows = await tx
    .select({ workDate: jobDays.workDate })
    .from(jobDays)
    .where(and(eq(jobDays.tenantId, tenantId), gte(jobDays.workDate, from)));
  return rows.map((row) => row.workDate);
}

export type ScheduleOutcome = "booked" | "moved" | "unchanged";

export interface ScheduleResult {
  job: Job;
  outcome: ScheduleOutcome;
  days: WorkDate[];
}

/**
 * Books a job into specific days, or moves it if it was already booked.
 *
 * The outcome is the point of the return value: a first booking earns the
 * customer a confirmation, a move earns them the "it's shifted" notice, and
 * re-confirming the same days earns them nothing at all. Build-plan M5
 * requires a move to notify them *once*, so the caller needs to know which
 * of the three just happened rather than guessing from the job's status.
 */
export async function scheduleJob(
  tx: AppTx,
  tenantId: string,
  jobId: string,
  days: WorkDate[],
): Promise<ScheduleResult> {
  const [job] = await tx
    .select()
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));
  if (!job) throw new Error("Job not found");
  if (job.status === "done" || job.status === "cancelled") {
    throw new Error(`Job is ${job.status} and can't be rescheduled`);
  }
  if (days.length === 0) throw new Error("Pick at least one day");

  const existing = await tx
    .select({ workDate: jobDays.workDate })
    .from(jobDays)
    .where(and(eq(jobDays.tenantId, tenantId), eq(jobDays.jobId, jobId)))
    .orderBy(asc(jobDays.workDate));

  const before = existing.map((row) => row.workDate);
  const wanted = [...days].sort();
  const unchanged = before.length === wanted.length && before.every((day, i) => day === wanted[i]);
  if (unchanged) return { job, outcome: "unchanged", days: before };

  await tx.delete(jobDays).where(and(eq(jobDays.tenantId, tenantId), eq(jobDays.jobId, jobId)));
  await tx.insert(jobDays).values(wanted.map((workDate) => ({ tenantId, jobId, workDate })));

  const [updated] = await tx
    .update(jobs)
    .set({ status: "scheduled", updatedAt: new Date() })
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .returning();

  return { job: updated, outcome: before.length === 0 ? "booked" : "moved", days: wanted };
}

export async function completeJob(
  tx: AppTx,
  tenantId: string,
  jobId: string,
  notes?: string,
): Promise<Job> {
  const [updated] = await tx
    .update(jobs)
    .set({ status: "done", completedAt: new Date(), completionNotes: notes, updatedAt: new Date() })
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .returning();
  if (!updated) throw new Error("Job not found");
  return updated;
}

export interface AddJobPhotoInput {
  clientPhotoId: string;
  bytes: Uint8Array;
  contentType: string;
  caption?: string;
}

/**
 * A completion photo. Same shape as addVisitPhoto, including why the
 * duplicate check is a SELECT rather than a caught unique violation:
 * postgres.js rolls the whole transaction back and rethrows when a
 * statement fails, so catching in here would lose the transaction anyway.
 * A genuine simultaneous race surfaces to the caller.
 */
export async function addJobPhoto(
  tx: AppTx,
  tenantId: string,
  jobId: string,
  input: AddJobPhotoInput,
): Promise<JobPhoto | null> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)));
  if (!job) throw new Error("Job not found");

  const [already] = await tx
    .select({ id: jobPhotos.id })
    .from(jobPhotos)
    .where(and(eq(jobPhotos.tenantId, tenantId), eq(jobPhotos.clientPhotoId, input.clientPhotoId)));
  if (already) return null;

  const key = `tenants/${tenantId}/jobs/${jobId}/${input.clientPhotoId}.jpg`;
  const stored = await getPhotoStore().put(key, input.bytes, input.contentType);

  const [row] = await tx
    .insert(jobPhotos)
    .values({
      tenantId,
      jobId,
      clientPhotoId: input.clientPhotoId,
      storageKey: stored.storageKey,
      contentType: input.contentType,
      byteSize: stored.byteSize,
      caption: input.caption,
    })
    .returning();
  return row;
}

export function listJobPhotos(tx: AppTx, tenantId: string, jobId: string): Promise<JobPhoto[]> {
  return tx
    .select()
    .from(jobPhotos)
    .where(and(eq(jobPhotos.tenantId, tenantId), eq(jobPhotos.jobId, jobId)))
    .orderBy(asc(jobPhotos.createdAt));
}
