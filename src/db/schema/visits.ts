import { pgTable, uuid, text, real, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "completed", "cancelled"]);
export const visitConditionEnum = pgEnum("visit_condition", ["good", "fair", "poor", "urgent"]);

/**
 * A booked quote visit. The UNIQUE(tenant_id, start_at) constraint is the
 * concurrency guard for self-booking (build-plan M2: "Two customers can't
 * book the same slot at the same time") — it only works because slots are
 * always grid-aligned server-side (src/lib/booking/slots.ts) and the
 * booking action re-validates against that grid rather than trusting a
 * client-supplied timestamp; see src/lib/booking/book.ts.
 */
export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: visitStatusEnum("status").notNull().default("scheduled"),

    // What the roofer records on site (M4). All nullable: a visit exists from
    // the moment it's booked and only gains these when he actually stands on
    // the roof. Capture is 1:1 with the visit, so it lives here rather than
    // in a child table; photos are many, so they get their own (visit_photos).
    //
    // clientCaptureId is generated on the phone before the capture is queued,
    // so a visit written up in airplane mode and synced later can't land
    // twice — the unique constraint below is what makes a retry a no-op.
    clientCaptureId: uuid("client_capture_id"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    roofType: text("roof_type"),
    material: text("material"),
    pitchDegrees: real("pitch_degrees"),
    areaM2: real("area_m2"),
    condition: visitConditionEnum("condition"),
    siteNotes: text("site_notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("visits_tenant_start_at_unique").on(table.tenantId, table.startAt),
    unique("visits_tenant_client_capture_unique").on(table.tenantId, table.clientCaptureId),
    index("visits_tenant_lead_idx").on(table.tenantId, table.leadId),
  ],
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
