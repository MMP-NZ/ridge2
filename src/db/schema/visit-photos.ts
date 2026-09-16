import { pgTable, uuid, integer, text, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { visits } from "./visits";

/**
 * Photos taken on a site visit. Bytes live in the PhotoStore (S3 in
 * production, local disk in dev — src/lib/photos), never in Postgres; this
 * table holds the key and the metadata.
 *
 * clientPhotoId is generated on the phone before upload, so a photo queued
 * offline and retried after reception returns can't land twice — the unique
 * constraint below is what makes the retry a no-op rather than a duplicate.
 */
export const visitPhotos = pgTable(
  "visit_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => visits.id, { onDelete: "cascade" }),

    clientPhotoId: uuid("client_photo_id").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    caption: text("caption"),
    // The roofer picks which site photos the customer sees on the quote.
    includeInQuote: boolean("include_in_quote").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("visit_photos_tenant_client_photo_unique").on(table.tenantId, table.clientPhotoId),
    index("visit_photos_tenant_visit_idx").on(table.tenantId, table.visitId),
  ],
);

export type VisitPhoto = typeof visitPhotos.$inferSelect;
export type NewVisitPhoto = typeof visitPhotos.$inferInsert;
