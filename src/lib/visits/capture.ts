import { and, eq } from "drizzle-orm";
import { visits, properties, leads, type Visit } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { advanceLeadStageTo, type LeadActor } from "@/lib/crm/leads";

export interface VisitCaptureInput {
  clientCaptureId: string;
  capturedAt?: Date;
  roofType?: string;
  material?: string;
  pitchDegrees?: number;
  areaM2?: number;
  condition?: "good" | "fair" | "poor" | "urgent";
  siteNotes?: string;
}

export interface CaptureResult {
  visit: Visit;
  /** False when this capture had already been recorded — a replayed offline sync. */
  applied: boolean;
}

/**
 * Records what the roofer measured on site, marks the visit done and moves
 * the lead to `visited` (build-plan M4).
 *
 * Safe to call twice with the same clientCaptureId. A capture written up in
 * airplane mode is queued on the phone and can genuinely arrive twice — the
 * request retried, or the app reopened mid-flush — and the second one must
 * not overwrite anything or emit a second timeline event. The id is
 * generated on the phone before the capture is queued, and
 * UNIQUE(tenant_id, client_capture_id) backs this check up in the database.
 */
export async function captureVisit(
  tx: AppTx,
  tenantId: string,
  visitId: string,
  input: VisitCaptureInput,
  actor: LeadActor,
): Promise<CaptureResult> {
  const [existing] = await tx
    .select()
    .from(visits)
    .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)));
  if (!existing) throw new Error("Visit not found");

  if (existing.clientCaptureId === input.clientCaptureId) {
    return { visit: existing, applied: false };
  }

  const [updated] = await tx
    .update(visits)
    .set({
      clientCaptureId: input.clientCaptureId,
      capturedAt: input.capturedAt ?? new Date(),
      roofType: input.roofType,
      material: input.material,
      pitchDegrees: input.pitchDegrees,
      areaM2: input.areaM2,
      condition: input.condition,
      siteNotes: input.siteNotes,
      status: "completed",
    })
    .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)))
    .returning();

  // The roof details belong to the property, not just this visit: the next
  // job at the same address should start from what he measured last time.
  // M1 declared these columns for exactly this.
  const [lead] = await tx
    .select({ propertyId: leads.propertyId, id: leads.id })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, updated.leadId)));

  if (lead) {
    // Only touch the property when he actually recorded something about the
    // roof. A visit saved with just notes — or nothing but a tap on Save —
    // is perfectly normal, and drizzle throws "No values to set" on an
    // update whose every value is undefined.
    const roofDetails = {
      roofType: input.roofType,
      material: input.material,
      pitchDegrees: input.pitchDegrees,
      areaM2: input.areaM2,
    };
    if (Object.values(roofDetails).some((value) => value !== undefined)) {
      await tx
        .update(properties)
        .set(roofDetails)
        .where(and(eq(properties.tenantId, tenantId), eq(properties.id, lead.propertyId)));
    }

    await advanceLeadStageTo(tx, tenantId, lead.id, "visited", actor);
  }

  return { visit: updated, applied: true };
}
