import { pgTable, uuid, integer, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { jobs } from "./jobs";

/**
 * Completion photos — what the roof looked like when he finished.
 *
 * Same shape as visit_photos, including the client-generated id and its
 * unique constraint, so a retried upload is a no-op rather than a duplicate.
 * Bytes live in the PhotoStore (src/lib/photos), never in Postgres.
 *
 * Kept separate from visit_photos rather than sharing one table with two
 * nullable parents: these are proof the work was done and will be attached
 * to a Xero invoice in M6, which is a different life from a measurement
 * photo taken before the job existed.
 */
export const jobPhotos = pgTable(
  "job_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    clientPhotoId: uuid("client_photo_id").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    caption: text("caption"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("job_photos_tenant_client_photo_unique").on(table.tenantId, table.clientPhotoId),
    index("job_photos_tenant_job_idx").on(table.tenantId, table.jobId),
  ],
);

export type JobPhoto = typeof jobPhotos.$inferSelect;
export type NewJobPhoto = typeof jobPhotos.$inferInsert;
