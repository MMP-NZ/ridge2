import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One per tenant (like calendar_rules and meta_connections) — the roofer's
 * own Xero organisation. Invoices are pushed into *his* Xero, never Juno
 * Logic's; Juno Logic's own books are M7's problem.
 *
 * Both tokens use the AES-256-GCM helper in src/lib/auth/encryption.ts,
 * same as TOTP secrets and Meta tokens: a long-lived credential that must
 * never be readable from a database dump alone.
 *
 * Xero rotates the refresh token on every refresh, so the new one must be
 * persisted or the connection dies at the next attempt. needsReconnectAt
 * is set when a refresh fails — access revoked from Xero's side, or a
 * rotation lost — and is what drives the reconnect prompt. Nothing is lost
 * when it's set: completed jobs simply stay un-invoiced until he
 * reconnects.
 */
export const xeroConnections = pgTable(
  "xero_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Xero's own id for the connected organisation (their "tenantId" — not ours). */
    xeroTenantId: text("xero_tenant_id").notNull(),
    organisationName: text("organisation_name"),

    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when a refresh fails. Non-null means "show the reconnect prompt and stop pushing". */
    needsReconnectAt: timestamp("needs_reconnect_at", { withTimezone: true }),
    /** Watermark for the twice-daily poll — only ask Xero for what changed since. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => [unique("xero_connections_one_per_tenant").on(table.tenantId)],
);

export type XeroConnection = typeof xeroConnections.$inferSelect;
export type NewXeroConnection = typeof xeroConnections.$inferInsert;
