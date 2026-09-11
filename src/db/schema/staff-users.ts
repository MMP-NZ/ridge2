import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Juno Logic staff. Deliberately NOT tenant-scoped — staff work across every
 * roofer from the admin console. Every access a staff session makes to a
 * tenant's data must produce an audit_log row (see audit-log.ts) — that is
 * enforced in application code (src/lib/auth/with-tenant-context.ts), not by
 * RLS, since staff legitimately need cross-tenant reads.
 */
export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),

  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffUser = typeof staffUsers.$inferSelect;
export type NewStaffUser = typeof staffUsers.$inferInsert;
