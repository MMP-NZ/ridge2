import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const sessionUserTypeEnum = pgEnum("session_user_type", ["roofer", "staff"]);

/**
 * Sessions for both user types live in one table so auth middleware has a
 * single lookup path. tenantId is set for roofer sessions (their one
 * tenant) and null for staff sessions (staff resolve a tenant per-request
 * from the URL/console, not from the session).
 *
 * tokenHash stores SHA-256 of the session token; the raw token only ever
 * lives in the httpOnly cookie, never in the database.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userType: sessionUserTypeEnum("user_type").notNull(),

  // Exactly one of these is set, matching userType. Enforced in application
  // code at session creation (src/lib/auth/session.ts); a CHECK constraint
  // is added in the RLS migration for defence in depth.
  rooferUserId: uuid("roofer_user_id"),
  staffUserId: uuid("staff_user_id"),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),

  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
