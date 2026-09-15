import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  pgEnum,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { leads } from "./leads";
import { customers } from "./customers";
import { properties } from "./properties";
import { visits } from "./visits";

export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "declined", "superseded"]);

/**
 * A quote built from a site visit and the roofer's price book.
 *
 * A sent quote is immutable — it is exactly what the customer was shown, and
 * from M6 it is what commission is calculated against. Changing a sent quote
 * creates a new one and marks the old `superseded` (see supersedesQuoteId),
 * rather than editing figures the customer may already be looking at.
 *
 * All four money columns are stored rather than derived at render, for the
 * same reason: editing the price book afterwards must not move a quote that
 * has already gone out. `gstRateBp` is snapshotted alongside them so the
 * arithmetic stays reproducible if the rate ever changes (it last moved in
 * 2010). The server recomputes all four from the lines on every save and
 * send — client-supplied totals are never trusted — and the check constraint
 * below is the backstop.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    // Null for a quote written up without a site visit (a phone quote for
    // simple work) — the build plan's flow always has one, but nothing in
    // the data model should require it.
    visitId: uuid("visit_id").references(() => visits.id, { onDelete: "set null" }),

    status: quoteStatusEnum("status").notNull().default("draft"),

    // Powers the public /quote/[quoteToken] page, exactly as leads.bookingToken
    // powers /book/[bookingToken] (M2): random, unguessable, no login.
    quoteToken: text("quote_token").notNull().unique(),

    subtotalExGstCents: integer("subtotal_ex_gst_cents").notNull().default(0),
    gstCents: integer("gst_cents").notNull().default(0),
    totalIncGstCents: integer("total_inc_gst_cents").notNull().default(0),
    gstRateBp: integer("gst_rate_bp").notNull().default(1500),

    notes: text("notes"),
    validUntil: timestamp("valid_until", { withTimezone: true }),

    sentAt: timestamp("sent_at", { withTimezone: true }),

    // Acceptance evidence: the customer types their full name to accept, and
    // we keep when and from where, so the roofer can show who agreed to what.
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedName: text("accepted_name"),
    acceptedIp: text("accepted_ip"),
    acceptedUserAgent: text("accepted_user_agent"),

    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declineReason: text("decline_reason"),

    supersedesQuoteId: uuid("supersedes_quote_id").references((): AnyPgColumn => quotes.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("quotes_tenant_status_idx").on(table.tenantId, table.status),
    index("quotes_tenant_lead_idx").on(table.tenantId, table.leadId),
    check("quotes_total_matches_parts", sql`${table.totalIncGstCents} = ${table.subtotalExGstCents} + ${table.gstCents}`),
  ],
);

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];
