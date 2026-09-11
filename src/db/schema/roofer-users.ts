import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One roofer user per tenant (CLAUDE.md: "one login per roofer business" —
 * no staff/roles on the roofer side). The unique constraint on tenant_id is
 * what enforces that at the database level, not just in app code.
 */
export const rooferUsers = pgTable(
  "roofer_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),

    // TOTP secret, encrypted at rest with an app-level key (see src/lib/auth/totp.ts).
    // Null until the roofer has completed 2FA enrollment.
    totpSecretEncrypted: text("totp_secret_encrypted"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("roofer_users_one_per_tenant").on(table.tenantId)],
);

export type RooferUser = typeof rooferUsers.$inferSelect;
export type NewRooferUser = typeof rooferUsers.$inferInsert;
