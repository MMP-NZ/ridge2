import { pgTable, uuid, date, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { jobs } from "./jobs";

/**
 * The days a job is booked in for, one row per day.
 *
 * Stored explicitly rather than as a start date plus a length, because a
 * three-day job starting Monday runs Mon/Wed/Thu when Tuesday is a quote
 * day. Keeping the actual days means the schedule is unambiguous, clash
 * checks are a plain date lookup, and — the real reason — changing his
 * quote days later can never silently move work already booked in.
 *
 * `date` rather than a timestamp: a work day is a whole day in NZ, not an
 * instant, so there is no timezone to get wrong.
 *
 * Deliberately no UNIQUE on (tenant_id, work_date): a gutter clean and a
 * leak repair can share a Tuesday. The suggester avoids days that already
 * hold work, so doubling up is something the roofer chooses rather than
 * something that happens to him.
 */
export const jobDays = pgTable(
  "job_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    workDate: date("work_date").notNull(),
  },
  (table) => [
    index("job_days_tenant_date_idx").on(table.tenantId, table.workDate),
    index("job_days_tenant_job_idx").on(table.tenantId, table.jobId),
  ],
);

export type JobDay = typeof jobDays.$inferSelect;
export type NewJobDay = typeof jobDays.$inferInsert;
