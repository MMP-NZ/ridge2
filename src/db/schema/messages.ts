import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { customers } from "./customers";
import { leads } from "./leads";

export const messageChannelEnum = pgEnum("message_channel", ["sms", "email"]);
export const messageDirectionEnum = pgEnum("message_direction", ["outbound", "inbound"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "blocked", "failed"]);

/**
 * One row per message, in or out. Written by both the log-only transport
 * (src/lib/messaging/log-only.ts — "sent" here means "recorded, not
 * actually delivered", per CLAUDE.md's no-real-sends-outside-production
 * rule) and the real ClickSend/Mailgun adapters, so it doubles as the
 * audit trail and the future two-way conversation history on a customer's
 * timeline. "blocked" = a commercial send skipped for lack of consent.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),

    channel: messageChannelEnum("channel").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    templateKey: text("template_key").notNull(),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull(),
    providerMessageId: text("provider_message_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_tenant_customer_idx").on(table.tenantId, table.customerId),
    index("messages_tenant_lead_idx").on(table.tenantId, table.leadId),
  ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
