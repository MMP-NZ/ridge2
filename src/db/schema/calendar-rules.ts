import { pgTable, uuid, smallint, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One row per tenant (like roofer_users) — the roofer's quote-day rules
 * that drive slot generation (src/lib/booking/slots.ts). Hours are stored
 * as minutes-from-local-midnight rather than a bare `time`, which has no
 * timezone semantics of its own — src/lib/time.ts's nzLocalToUtc is what
 * turns "480 minutes on a quote day" into an actual UTC instant.
 */
export const calendarRules = pgTable(
  "calendar_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    // 0 = Sunday .. 6 = Saturday, matching src/lib/time.ts's toNzParts().weekday.
    quoteDaysOfWeek: smallint("quote_days_of_week").array().notNull(),
    quoteHoursStartMin: smallint("quote_hours_start_min").notNull().default(480), // 8:00am
    quoteHoursEndMin: smallint("quote_hours_end_min").notNull().default(960), // 4:00pm

    visitLengthMinutes: smallint("visit_length_minutes").notNull().default(45),
    travelBufferMinutes: smallint("travel_buffer_minutes").notNull().default(15),
    maxVisitsPerQuoteDay: smallint("max_visits_per_quote_day"), // null = uncapped

    // Free-text suburb names; empty/null = no restriction. See
    // src/lib/booking/slots.ts for the (text-matching, not geocoded) check.
    serviceAreaSuburbs: text("service_area_suburbs").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("calendar_rules_one_per_tenant").on(table.tenantId)],
);

export type CalendarRules = typeof calendarRules.$inferSelect;
export type NewCalendarRules = typeof calendarRules.$inferInsert;
