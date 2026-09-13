import { eq, and } from "drizzle-orm";
import { leads, properties, visits } from "@/db/schema";
import { withSystemTenantContext } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { getCalendarRules } from "./calendar-rules";
import { generateOpenSlots } from "./slots";
import { advanceLeadStage } from "@/lib/crm/leads";
import { scheduleVisitJobs } from "@/lib/jobs/schedule-visit-jobs";

export type BookVisitResult =
  | { status: "booked"; visitId: string }
  | { status: "slot_taken" }
  // Covers: lead not found/already booked, calendar rules not configured,
  // or the requested time isn't one of the currently-open slots (stale
  // client state, or a tampered timestamp) — nothing here should be
  // distinguishable from the outside, so the booking page just says
  // "pick another time" for all of them.
  | { status: "not_open" };

const SLOT_SEARCH_WINDOW_DAYS = 21;

/**
 * Books a quote visit for a lead. Re-derives the currently-open slots
 * server-side and only accepts `startAt` if it's still one of them — never
 * trusts a client-supplied timestamp directly. The visits table's
 * UNIQUE(tenant_id, start_at) constraint is the last line of defense: if
 * two requests race for the same slot, one's INSERT wins and the other's
 * throws a unique violation, caught here as "slot_taken" after the whole
 * transaction rolls back (a Postgres transaction can't recover mid-way
 * after a constraint error, so this is caught outside withSystemTenantContext,
 * not inside it).
 */
export async function bookVisit(tenantId: string, leadId: string, startAt: Date): Promise<BookVisitResult> {
  try {
    const result = await withSystemTenantContext(tenantId, async (tx) => {
      const [lead] = await tx
        .select()
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
      if (!lead || lead.stage !== "new") return { status: "not_open" as const };

      const [property] = await tx.select().from(properties).where(eq(properties.id, lead.propertyId));
      const rules = await getCalendarRules(tx, tenantId);
      if (!rules || !property) return { status: "not_open" as const };

      const now = new Date();
      const to = new Date(now.getTime() + SLOT_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const existingVisits = await tx.select({ startAt: visits.startAt }).from(visits).where(eq(visits.tenantId, tenantId));

      const { slots, declined } = generateOpenSlots(rules, existingVisits, property.address, now, to, now);
      if (declined || !slots.some((slot) => slot.getTime() === startAt.getTime())) {
        return { status: "not_open" as const };
      }

      const endAt = new Date(startAt.getTime() + rules.visitLengthMinutes * 60 * 1000);
      const [visit] = await tx.insert(visits).values({ tenantId, leadId, startAt, endAt }).returning();
      await advanceLeadStage(tx, tenantId, leadId, { type: "system" });

      return { status: "booked" as const, visitId: visit.id, startAt: visit.startAt };
    });

    if (result.status === "booked") {
      await scheduleVisitJobs(tenantId, result.visitId, result.startAt);
      return { status: "booked", visitId: result.visitId };
    }
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) return { status: "slot_taken" };
    throw err;
  }
}
