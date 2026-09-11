import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { staffUsers } from "./staff-users";

/**
 * One row per Juno Logic staff access to a tenant's data (CLAUDE.md:
 * "Log every Juno Logic staff access to a roofer's account, and show that
 * log to the roofer"). Written by withStaffTenantAccess() in
 * src/lib/auth/with-tenant-context.ts, in the same transaction as the
 * staff action it records, so a failure to log fails the whole request.
 *
 * Tenant-scoped for RLS purposes (a roofer can read their own log rows),
 * but written by staff sessions which bypass the tenant filter — see the
 * RLS policy for this table in src/db/migrations.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  staffUserId: uuid("staff_user_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "restrict" }),

  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
