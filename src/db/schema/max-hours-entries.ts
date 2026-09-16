import { pgTable, uuid, integer, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { staffUsers } from "./staff-users";

/**
 * Time Juno Logic staff spent on a MAX client, logged against a month.
 *
 * CLAUDE.md is explicit that MAX hours are internal and never shown to
 * clients — they exist so Juno Logic can tell whether a MAX client is still
 * profitable at four hours a month, not as something to justify to him.
 * Nothing in the roofer-facing app reads this table.
 */
export const maxHoursEntries = pgTable(
  "max_hours_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    periodMonth: date("period_month").notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),

    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("max_hours_tenant_month_idx").on(table.tenantId, table.periodMonth)],
);

export type MaxHoursEntry = typeof maxHoursEntries.$inferSelect;
