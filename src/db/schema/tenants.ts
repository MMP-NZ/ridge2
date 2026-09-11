import { pgTable, uuid, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const tenantPlanEnum = pgEnum("tenant_plan", ["basic", "max"]);

/**
 * One row per roofer business. Not itself tenant-scoped (it IS the tenant),
 * so it carries no tenant_id and has no RLS policy restricting rows by
 * tenant — every roofer/staff session can resolve its own tenant row, but
 * app code must still only ever fetch the caller's own tenant by id.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  plan: tenantPlanEnum("plan").notNull().default("basic"),

  // Key dates driving billing (CLAUDE.md: first month free, 3-month minimum,
  // founding price lock for first 10 roofers for 24 months).
  freeMonthEndsAt: timestamp("free_month_ends_at", { withTimezone: true }),
  minimumTermEndsAt: timestamp("minimum_term_ends_at", { withTimezone: true }),
  priceLockEndsAt: timestamp("price_lock_ends_at", { withTimezone: true }),
  websiteOwnershipDate: timestamp("website_ownership_date", { withTimezone: true }),

  // Commission defaults per CLAUDE.md: 6% (600 basis points), $5,000 cap.
  // Stored per-tenant (not hardcoded) in case terms ever need to vary.
  commissionRateBp: integer("commission_rate_bp").notNull().default(600),
  commissionCapCents: integer("commission_cap_cents").notNull().default(500_000),

  // Embedded in this tenant's Juno-built website so it can POST enquiries
  // to /api/public/leads/[intakeKey] — see src/lib/crm/intake.ts. Readable
  // pre-authentication (ridge_auth), so it must never double as a secret
  // beyond "which tenant is this for" (no read access, write-only intake).
  publicIntakeKey: text("public_intake_key").notNull().unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
