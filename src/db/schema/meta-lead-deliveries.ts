import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";

export const metaLeadDeliveryStatusEnum = pgEnum("meta_lead_delivery_status", [
  "received",
  "processed",
  "duplicate",
  "failed",
]);

/**
 * One row per Meta leadgen webhook delivery, keyed on Meta's own
 * leadgen_id (globally unique, not just per-tenant — it's Meta's ID, not
 * ours). This is the idempotency mechanism for "duplicate webhook
 * deliveries don't create duplicate leads" (build-plan M3): the unique
 * constraint on leadgenId is what a redelivery collides with, the same
 * pattern visits.tenant_id+start_at uses for booking concurrency (M2).
 */
export const metaLeadDeliveries = pgTable(
  "meta_lead_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadgenId: text("leadgen_id").notNull().unique(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    status: metaLeadDeliveryStatusEnum("status").notNull().default("received"),
    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("meta_lead_deliveries_tenant_idx").on(table.tenantId)],
);

export type MetaLeadDelivery = typeof metaLeadDeliveries.$inferSelect;
export type NewMetaLeadDelivery = typeof metaLeadDeliveries.$inferInsert;
