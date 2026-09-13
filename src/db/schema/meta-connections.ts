import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * One row per tenant (like calendar_rules) — the roofer's connected
 * Facebook Page, used by the M3 leadgen webhook to resolve which tenant a
 * delivery belongs to (by pageId) and to call the Graph API on the
 * roofer's behalf. accessTokenEncrypted uses the same AES-256-GCM helper
 * as TOTP secrets (src/lib/auth/encryption.ts) — same reasoning: a
 * long-lived credential that must never be readable from a DB dump alone.
 */
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    pageId: text("page_id").notNull(),
    pageName: text("page_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),

    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    // Set once POST /{page-id}/subscribed_apps succeeds — null means leads
    // won't actually arrive yet even though the Page is "connected".
    webhookSubscribedAt: timestamp("webhook_subscribed_at", { withTimezone: true }),
  },
  (table) => [unique("meta_connections_one_per_tenant").on(table.tenantId), unique("meta_connections_page_id_unique").on(table.pageId)],
);

export type MetaConnection = typeof metaConnections.$inferSelect;
export type NewMetaConnection = typeof metaConnections.$inferInsert;
