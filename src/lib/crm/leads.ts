import { and, eq } from "drizzle-orm";
import { leads, leadEvents, type Lead, type LeadSource } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { withStaffTenantAccess } from "@/lib/auth/with-tenant-context";
import { generateToken } from "@/lib/tokens";

export interface LeadActor {
  type: "roofer" | "staff" | "system";
  /** A roofer_users.id or staff_users.id; omitted for the 'system' actor (e.g. website intake). */
  id?: string;
}

async function getLeadOrThrow(tx: AppTx, tenantId: string, leadId: string): Promise<Lead> {
  const [lead] = await tx
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
  if (!lead) throw new Error("Lead not found");
  return lead;
}

/** Creates a lead and its 'created' timeline event. Source is set here and treated as locked from this point on — see changeLeadSource. */
export async function createLead(
  tx: AppTx,
  tenantId: string,
  input: { customerId: string; propertyId: string; source: LeadSource; campaign?: string },
  actor: LeadActor,
): Promise<Lead> {
  const [lead] = await tx
    .insert(leads)
    .values({
      tenantId,
      customerId: input.customerId,
      propertyId: input.propertyId,
      source: input.source,
      campaign: input.campaign,
      bookingToken: generateToken(),
    })
    .returning();

  await tx
    .insert(leadEvents)
    .values({ tenantId, leadId: lead.id, type: "created", toValue: input.source, actorType: actor.type, actorId: actor.id });

  return lead;
}

// CLAUDE.md domain language: new → booked → visited → quoted → won, with
// lost as a closed state reachable from anywhere before won.
const STAGE_ORDER = ["new", "booked", "visited", "quoted", "won"] as const;

/** Moves a lead to the next stage in sequence (the pipeline's "big green button"). */
export async function advanceLeadStage(tx: AppTx, tenantId: string, leadId: string, actor: LeadActor): Promise<Lead> {
  const current = await getLeadOrThrow(tx, tenantId, leadId);
  const currentIndex = STAGE_ORDER.indexOf(current.stage as (typeof STAGE_ORDER)[number]);
  if (currentIndex === -1 || currentIndex === STAGE_ORDER.length - 1) {
    throw new Error(`Lead is already at its final stage (${current.stage})`);
  }
  const nextStage = STAGE_ORDER[currentIndex + 1];

  const [updated] = await tx
    .update(leads)
    .set({ stage: nextStage, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();

  await tx
    .insert(leadEvents)
    .values({ tenantId, leadId, type: "stage_changed", fromValue: current.stage, toValue: nextStage, actorType: actor.type, actorId: actor.id });

  return updated;
}

/**
 * Moves a lead forward to a specific stage, skipping intermediate ones, and
 * does nothing if it is already at or past that stage.
 *
 * This is what M4's automatic transitions use, and it exists because
 * advanceLeadStage can't serve them: accepting a quote takes a lead from
 * `visited` straight to `won` (two steps), and a visit captured offline can
 * sync after the roofer has already moved the lead on by hand, or twice if a
 * queued request is retried. Both would throw or double-count through the
 * step-by-step path. Being a no-op when the lead is already ahead is what
 * makes the offline replay safe.
 *
 * A lead that's already `lost` or `won` is left alone — closing is the
 * roofer's decision to reverse, not an automatic transition's.
 */
export async function advanceLeadStageTo(
  tx: AppTx,
  tenantId: string,
  leadId: string,
  target: (typeof STAGE_ORDER)[number],
  actor: LeadActor,
): Promise<Lead> {
  const current = await getLeadOrThrow(tx, tenantId, leadId);
  if (current.stage === "lost" || current.stage === "won") return current;

  const currentIndex = STAGE_ORDER.indexOf(current.stage as (typeof STAGE_ORDER)[number]);
  const targetIndex = STAGE_ORDER.indexOf(target);
  if (currentIndex >= targetIndex) return current;

  const [updated] = await tx
    .update(leads)
    .set({ stage: target, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();

  await tx
    .insert(leadEvents)
    .values({ tenantId, leadId, type: "stage_changed", fromValue: current.stage, toValue: target, actorType: actor.type, actorId: actor.id });

  return updated;
}

/** Closes a lead as lost (the pipeline's "big red button"). */
export async function closeLead(tx: AppTx, tenantId: string, leadId: string, actor: LeadActor): Promise<Lead> {
  const current = await getLeadOrThrow(tx, tenantId, leadId);
  if (current.stage === "lost" || current.stage === "won") {
    throw new Error(`Lead is already closed (${current.stage})`);
  }

  const [updated] = await tx
    .update(leads)
    .set({ stage: "lost", updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning();

  await tx
    .insert(leadEvents)
    .values({ tenantId, leadId, type: "stage_changed", fromValue: current.stage, toValue: "lost", actorType: actor.type, actorId: actor.id });

  return updated;
}

/**
 * The only way to change a lead's source after creation. Staff-only,
 * audit-logged via withStaffTenantAccess (CLAUDE.md non-negotiable: every
 * staff access to a tenant is logged). No roofer-facing equivalent exists —
 * roofers set source once, at creation.
 */
export async function changeLeadSource(
  staffUserId: string,
  tenantId: string,
  leadId: string,
  newSource: LeadSource,
): Promise<Lead> {
  return withStaffTenantAccess(staffUserId, tenantId, "lead.source.change", async (tx) => {
    const current = await getLeadOrThrow(tx, tenantId, leadId);

    const [updated] = await tx
      .update(leads)
      .set({ source: newSource, updatedAt: new Date() })
      .where(eq(leads.id, leadId))
      .returning();

    await tx.insert(leadEvents).values({
      tenantId,
      leadId,
      type: "source_changed",
      fromValue: current.source,
      toValue: newSource,
      actorType: "staff",
      actorId: staffUserId,
    });

    return updated;
  });
}
