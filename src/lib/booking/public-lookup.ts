import { eq } from "drizzle-orm";
import { authDb, withSystemTenantContext } from "@/db/client";
import { leads, tenants, properties, calendarRules, visits } from "@/db/schema";
import { generateOpenSlots } from "./slots";

export interface PublicBookingPageData {
  leadId: string;
  stage: string;
  businessName: string;
  propertyAddress: string;
  slots: Date[];
  declined: boolean;
  configured: boolean;
}

const SLOT_SEARCH_WINDOW_DAYS = 21;

/**
 * Everything the public /book/[bookingToken] page needs, resolved from
 * just the token — no session exists at this point. The token lookup
 * itself uses ridge_auth (see 0005_booking_rls.sql's leads_auth_lookup
 * policy); once the tenant_id is known, everything else goes through the
 * normal RLS-enforced system context.
 */
export async function getBookingPageData(bookingToken: string): Promise<PublicBookingPageData | null> {
  const [lead] = await authDb().select().from(leads).where(eq(leads.bookingToken, bookingToken)).limit(1);
  if (!lead) return null;

  return withSystemTenantContext(lead.tenantId, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, lead.tenantId));
    const [property] = await tx.select().from(properties).where(eq(properties.id, lead.propertyId));
    const [rules] = await tx.select().from(calendarRules).where(eq(calendarRules.tenantId, lead.tenantId));

    if (!rules) {
      return {
        leadId: lead.id,
        stage: lead.stage,
        businessName: tenant.businessName,
        propertyAddress: property.address,
        slots: [],
        declined: false,
        configured: false,
      };
    }

    const now = new Date();
    const to = new Date(now.getTime() + SLOT_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const existingVisits = await tx.select({ startAt: visits.startAt }).from(visits).where(eq(visits.tenantId, lead.tenantId));
    const { slots, declined } = generateOpenSlots(rules, existingVisits, property.address, now, to, now);

    return {
      leadId: lead.id,
      stage: lead.stage,
      businessName: tenant.businessName,
      propertyAddress: property.address,
      slots,
      declined,
      configured: true,
    };
  });
}
