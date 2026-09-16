import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Juno Logic's own Xero, where invoices **to** roofers are raised.
 *
 * Deliberately not tenant-scoped and carrying no tenant_id: it belongs to
 * Juno Logic, not to any roofer, and no roofer should ever be able to reach
 * it. Only staff sessions touch this table.
 *
 * One row. `singleton` exists purely so a UNIQUE constraint can enforce
 * that — a second connection would silently split billing across two sets
 * of books.
 */
export const platformXeroConnection = pgTable("platform_xero_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  singleton: text("singleton").notNull().unique().default("only"),

  xeroTenantId: text("xero_tenant_id").notNull(),
  organisationName: text("organisation_name"),

  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  needsReconnectAt: timestamp("needs_reconnect_at", { withTimezone: true }),
});

export type PlatformXeroConnection = typeof platformXeroConnection.$inferSelect;
