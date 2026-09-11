import { and, eq, gte, lt, asc } from "drizzle-orm";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { visits, leads, customers, properties } from "@/db/schema";

export interface VisitListItem {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  customerName: string;
  propertyAddress: string;
}

/** Visits in [from, to), ordered by start time — used by the calendar week view and Today. */
export async function listVisits(tenantId: string, from: Date, to: Date): Promise<VisitListItem[]> {
  return withRooferAccess(tenantId, (tx) =>
    tx
      .select({
        id: visits.id,
        startAt: visits.startAt,
        endAt: visits.endAt,
        status: visits.status,
        customerName: customers.name,
        propertyAddress: properties.address,
      })
      .from(visits)
      .innerJoin(leads, eq(leads.id, visits.leadId))
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .innerJoin(properties, eq(properties.id, leads.propertyId))
      .where(and(eq(visits.tenantId, tenantId), gte(visits.startAt, from), lt(visits.startAt, to)))
      .orderBy(asc(visits.startAt)),
  );
}

export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
