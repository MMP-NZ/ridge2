import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

export const leadEventTypeEnum = pgEnum("lead_event_type", ["created", "stage_changed", "source_changed"]);
export const leadEventActorTypeEnum = pgEnum("lead_event_actor_type", ["roofer", "staff", "system"]);

/**
 * One row per change to a lead. Feeds a lead's own history and, joined
 * through leads, each customer's full timeline (build-plan M1: "Stage
 * changes and source changes appear on the customer timeline"). actorId is
 * a roofer_users.id or staff_users.id depending on actorType, or null for
 * actorType 'system' (e.g. the website intake creating a lead unattended).
 */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    type: leadEventTypeEnum("type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    actorType: leadEventActorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lead_events_tenant_lead_idx").on(table.tenantId, table.leadId),
    index("lead_events_occurred_at_idx").on(table.occurredAt),
  ],
);

export type LeadEvent = typeof leadEvents.$inferSelect;
export type NewLeadEvent = typeof leadEvents.$inferInsert;
