import { and, eq, desc, inArray, lt } from "drizzle-orm";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { customers, properties, leads, leadEvents, type LeadStage } from "@/db/schema";
import { needsCallCutoff } from "@/lib/jobs/schedule";

export interface LeadListItem {
  id: string;
  stage: LeadStage;
  source: string;
  createdAt: Date;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  propertyAddress: string;
}

/** Leads for the pipeline list, optionally filtered to one stage, newest first. */
export async function listLeads(tenantId: string, stage?: LeadStage): Promise<LeadListItem[]> {
  return withRooferAccess(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: leads.id,
        stage: leads.stage,
        source: leads.source,
        createdAt: leads.createdAt,
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        propertyAddress: properties.address,
      })
      .from(leads)
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .innerJoin(properties, eq(properties.id, leads.propertyId))
      .where(stage ? and(eq(leads.tenantId, tenantId), eq(leads.stage, stage)) : eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt));
    return rows;
  });
}

/** Count of new leads waiting — Today screen v1. */
export async function countNewLeads(tenantId: string): Promise<number> {
  const rows = await listLeads(tenantId, "new");
  return rows.length;
}

/** Leads still `new` more than 2 days after creation (build-plan M2's "call task at 2 days", surfaced as a computed filter rather than a stored task — see docs/decisions.md). */
export async function countLeadsNeedingCall(tenantId: string): Promise<number> {
  return withRooferAccess(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.stage, "new"), lt(leads.createdAt, needsCallCutoff(new Date()))));
    return rows.length;
  });
}

export interface CustomerDetail {
  customer: typeof customers.$inferSelect;
  properties: (typeof properties.$inferSelect)[];
  leads: (typeof leads.$inferSelect)[];
  events: (typeof leadEvents.$inferSelect)[];
}

/** Customer page: their details, properties, and the full timeline of every lead event across all their leads. */
export async function getCustomerDetail(tenantId: string, customerId: string): Promise<CustomerDetail | null> {
  return withRooferAccess(tenantId, async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));
    if (!customer) return null;

    const customerProperties = await tx
      .select()
      .from(properties)
      .where(and(eq(properties.tenantId, tenantId), eq(properties.customerId, customerId)));

    const customerLeads = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.customerId, customerId)));

    const leadIds = customerLeads.map((lead) => lead.id);
    const events = leadIds.length
      ? await tx
          .select()
          .from(leadEvents)
          .where(and(eq(leadEvents.tenantId, tenantId), inArray(leadEvents.leadId, leadIds)))
          .orderBy(desc(leadEvents.occurredAt))
      : [];

    return { customer, properties: customerProperties, leads: customerLeads, events };
  });
}
