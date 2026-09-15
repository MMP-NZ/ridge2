import { pgTable, uuid, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { quotes } from "./quotes";
import { leads } from "./leads";
import { customers } from "./customers";
import { properties } from "./properties";

export const jobStatusEnum = pgEnum("job_status", ["ready_to_schedule", "scheduled", "done", "cancelled"]);

/**
 * Accepted work. Created the moment a customer accepts a quote (build-plan
 * M4 done-when: "Accepting a quote online marks the lead won and creates a
 * job"), which is why it exists this early — M5 owns scheduling it into work
 * days, completion photos and the rest, and will add those columns.
 *
 * quoteId is UNIQUE: that constraint, not application logic, is what stops a
 * double-tapped or replayed acceptance creating two jobs — the same job the
 * UNIQUE(tenant_id, start_at) on visits does for double-booking in M2.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id")
      .notNull()
      .unique()
      .references(() => quotes.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    status: jobStatusEnum("status").notNull().default("ready_to_schedule"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("jobs_tenant_status_idx").on(table.tenantId, table.status)],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
