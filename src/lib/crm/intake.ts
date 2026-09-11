import { and, eq, gte, count } from "drizzle-orm";
import { authDb, withSystemTenantContext } from "@/db/client";
import { tenants, leads } from "@/db/schema";
import { generateToken } from "@/lib/tokens";
import { findOrCreateCustomer, findOrCreateProperty } from "./dedupe";
import { createLead } from "./leads";
import { scheduleLeadFollowUps } from "@/lib/jobs/schedule-lead-jobs";

/** Generates a new tenant's public_intake_key — used at tenant creation (seed.ts, and M7's onboarding flow). */
export function generateIntakeKey(): string {
  return generateToken();
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 5;

export interface WebsiteLeadPayload {
  name: string;
  phone?: string;
  email?: string;
  address: string;
  message?: string;
  /** A hidden form field real visitors never fill in. Any non-empty value means a bot filled the form. */
  honeypot?: string;
}

export type SubmitWebsiteLeadResult =
  | { status: "created"; leadId: string }
  // Honeypot tripped, or the intake key doesn't match any tenant — either
  // way we don't want to signal *why* to whatever submitted the form.
  | { status: "ignored" }
  | { status: "rate_limited" };

/**
 * The public website intake endpoint's business logic (called from
 * src/app/api/public/leads/[intakeKey]/route.ts). No session exists here —
 * the intake key resolves which tenant this is for (via ridge_auth, the
 * same pre-authentication lookup role used for login), then the actual
 * write goes through the normal RLS-enforced tenant-scoped path.
 */
export async function submitWebsiteLead(intakeKey: string, payload: WebsiteLeadPayload): Promise<SubmitWebsiteLeadResult> {
  if (payload.honeypot) {
    return { status: "ignored" };
  }
  if (!payload.name?.trim() || !payload.address?.trim() || (!payload.phone?.trim() && !payload.email?.trim())) {
    throw new Error("A website lead needs a name, an address, and a phone or email");
  }

  const [tenant] = await authDb().select().from(tenants).where(eq(tenants.publicIntakeKey, intakeKey)).limit(1);
  if (!tenant) {
    return { status: "ignored" };
  }

  const result = await withSystemTenantContext(tenant.id, async (tx) => {
    const [{ recentCount }] = await tx
      .select({ recentCount: count() })
      .from(leads)
      .where(
        and(
          eq(leads.tenantId, tenant.id),
          eq(leads.source, "juno_website"),
          gte(leads.createdAt, new Date(Date.now() - RATE_LIMIT_WINDOW_MS)),
        ),
      );

    if (recentCount >= RATE_LIMIT_MAX_PER_WINDOW) {
      return { status: "rate_limited" as const };
    }

    const customer = await findOrCreateCustomer(tx, tenant.id, {
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
    });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, payload.address);
    const lead = await createLead(
      tx,
      tenant.id,
      { customerId: customer.id, propertyId: property.id, source: "juno_website" },
      { type: "system" },
    );

    return { status: "created" as const, leadId: lead.id, createdAt: lead.createdAt };
  });

  // Queued after the transaction commits — job scheduling isn't itself
  // transactional with the lead insert (see schedule-lead-jobs.ts).
  if (result.status === "created") {
    await scheduleLeadFollowUps(tenant.id, result.leadId, result.createdAt);
    return { status: "created", leadId: result.leadId };
  }
  return result;
}
