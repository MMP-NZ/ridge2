import { and, eq } from "drizzle-orm";
import { visits, leads, customers, properties, type Visit, type VisitPhoto } from "@/db/schema";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { listVisitPhotos } from "./photos";

export interface VisitDetail {
  visit: Visit;
  leadId: string;
  customerId: string;
  customerName: string;
  propertyId: string;
  propertyAddress: string;
  photos: VisitPhoto[];
}

export async function getVisitDetail(tenantId: string, visitId: string): Promise<VisitDetail | null> {
  return withRooferAccess(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        visit: visits,
        leadId: leads.id,
        customerId: customers.id,
        customerName: customers.name,
        propertyId: properties.id,
        propertyAddress: properties.address,
      })
      .from(visits)
      .innerJoin(leads, eq(leads.id, visits.leadId))
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .innerJoin(properties, eq(properties.id, leads.propertyId))
      .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)));

    if (!row) return null;

    return { ...row, photos: await listVisitPhotos(tx, tenantId, visitId) };
  });
}
