import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { customers } from "./customers";
import { properties } from "./properties";

// Domain language, CLAUDE.md: source drives commission eligibility (M6),
// stage drives the pipeline. Every value here matches CLAUDE.md verbatim.
export const leadSourceEnum = pgEnum("lead_source", ["juno_ads", "juno_website", "juno_referral", "roofer_own"]);
export const leadStageEnum = pgEnum("lead_stage", ["new", "booked", "visited", "quoted", "won", "lost"]);

/**
 * An enquiry. Source is set at creation and treated as locked from then on
 * — only changeLeadSource() (staff-only, audited) may change it after the
 * fact; see src/lib/crm/leads.ts.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    source: leadSourceEnum("source").notNull(),
    campaign: text("campaign"),
    stage: leadStageEnum("stage").notNull().default("new"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("leads_tenant_stage_idx").on(table.tenantId, table.stage),
    index("leads_tenant_customer_idx").on(table.tenantId, table.customerId),
  ],
);

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadSource = (typeof leadSourceEnum.enumValues)[number];
export type LeadStage = (typeof leadStageEnum.enumValues)[number];
