import { eq } from "drizzle-orm";
import { authDb, withSystemTenantContext } from "@/db/client";
import { metaConnections, metaLeadDeliveries } from "@/db/schema";
import { isUniqueViolation } from "@/db/errors";
import { decryptSecret } from "@/lib/auth/encryption";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { scheduleLeadFollowUps } from "@/lib/jobs/schedule-lead-jobs";
import { getLead } from "./graph";
import { parseMetaLeadFields } from "./parse-lead";

export interface LeadgenChange {
  leadgen_id: string;
  page_id: string;
  form_id?: string;
  adgroup_id?: string;
  ad_id?: string;
}

export type ProcessDeliveryResult =
  | { status: "processed"; leadId: string }
  | { status: "duplicate" }
  // Not one of our connected Pages (stale subscription, or not us at all).
  | { status: "ignored" }
  | { status: "failed"; reason: string };

/**
 * Everything the leadgen webhook route needs after signature verification.
 * Same shape as M1's website intake and M2's booking: resolve the tenant
 * via a pre-authentication lookup (here: by page_id, through ridge_auth —
 * see 0007_meta_ads_rls.sql's meta_connections_auth_lookup policy), then do
 * the actual write through the normal RLS-enforced system context.
 */
export async function processLeadgenDelivery(change: LeadgenChange): Promise<ProcessDeliveryResult> {
  const [connection] = await authDb().select().from(metaConnections).where(eq(metaConnections.pageId, change.page_id)).limit(1);
  if (!connection) return { status: "ignored" };

  try {
    const result = await withSystemTenantContext(connection.tenantId, async (tx) => {
      // Idempotency: a redelivery of the same leadgen_id collides with this
      // unique constraint and throws — caught below, same pattern as M2's
      // booking-slot race (a Postgres transaction can't recover mid-way
      // after a constraint error, so the whole thing rolls back and this
      // is treated as a clean "duplicate", not a partial write).
      const [delivery] = await tx
        .insert(metaLeadDeliveries)
        .values({ tenantId: connection.tenantId, leadgenId: change.leadgen_id, status: "received" })
        .returning();

      const accessToken = decryptSecret(connection.accessTokenEncrypted);
      const leadData = await getLead(change.leadgen_id, accessToken);
      const parsed = parseMetaLeadFields(leadData.field_data);

      if (!parsed.phone && !parsed.email) {
        await tx
          .update(metaLeadDeliveries)
          .set({ status: "failed", note: "Lead had no phone or email" })
          .where(eq(metaLeadDeliveries.id, delivery.id));
        return { outcome: "failed" as const, reason: "Lead had no phone or email" };
      }

      const customer = await findOrCreateCustomer(tx, connection.tenantId, {
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email,
      });
      const property = await findOrCreateProperty(tx, connection.tenantId, customer.id, parsed.address);
      const lead = await createLead(
        tx,
        connection.tenantId,
        { customerId: customer.id, propertyId: property.id, source: "juno_ads", campaign: change.ad_id ?? change.form_id },
        { type: "system" },
      );

      await tx.update(metaLeadDeliveries).set({ leadId: lead.id, status: "processed" }).where(eq(metaLeadDeliveries.id, delivery.id));

      return { outcome: "processed" as const, leadId: lead.id, createdAt: lead.createdAt };
    });

    if (result.outcome === "failed") {
      return { status: "failed", reason: result.reason };
    }

    await scheduleLeadFollowUps(connection.tenantId, result.leadId, result.createdAt);
    return { status: "processed", leadId: result.leadId };
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "duplicate" };
    throw err;
  }
}
