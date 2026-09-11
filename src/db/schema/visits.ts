import { pgTable, uuid, timestamp, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "completed", "cancelled"]);

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

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("visits_tenant_start_at_unique").on(table.tenantId, table.startAt),
    index("visits_tenant_lead_idx").on(table.tenantId, table.leadId),
  ],
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
