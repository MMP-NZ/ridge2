import { eq, and } from "drizzle-orm";
import { withSystemTenantContext } from "@/db/client";
import type { AppTx } from "@/db/client";
import { leads, customers, tenants, visits, type Customer } from "@/db/schema";
import { closeLead } from "@/lib/crm/leads";
import { sendTransactional } from "@/lib/messaging/send";
import {
  bookingLinkMessage,
  noBookingNudge4hMessage,
  noBookingNudge2dMessage,
  visitConfirmationMessage,
  visitReminderMessage,
} from "@/lib/messaging/templates";
import type { LeadJobPayload, VisitJobPayload } from "./queue-names";

/** Sends the same rendered message over every channel the customer has contact details for. */
async function sendToCustomer(
  tx: AppTx,
  tenantId: string,
  customer: Customer,
  leadId: string | undefined,
  templateKey: string,
  message: { subject: string; body: string },
): Promise<void> {
  if (customer.phone) {
    await sendTransactional(tx, {
      tenantId,
      customerId: customer.id,
      leadId,
      channel: "sms",
      to: customer.phone,
      templateKey,
      body: message.body,
    });
  }
  if (customer.email) {
    await sendTransactional(tx, {
      tenantId,
      customerId: customer.id,
      leadId,
      channel: "email",
      to: customer.email,
      templateKey,
      subject: message.subject,
      body: message.body,
    });
  }
}

async function getLeadContext(tx: AppTx, tenantId: string, leadId: string) {
  const [row] = await tx
    .select({ lead: leads, customer: customers, tenant: tenants })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .innerJoin(tenants, eq(tenants.id, leads.tenantId))
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
  return row;
}

export async function handleSendBookingLink(payload: LeadJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const row = await getLeadContext(tx, payload.tenantId, payload.leadId);
    if (!row) return;
    const message = bookingLinkMessage(row.tenant.businessName, row.lead.bookingToken);
    await sendToCustomer(tx, payload.tenantId, row.customer, row.lead.id, "booking_link", message);
  });
}

/** Shared by both nudge handlers — the "still new" check is what makes the sequence stop as soon as a lead books. */
async function handleNoBookingNudge(
  payload: LeadJobPayload,
  templateKey: string,
  renderMessage: (businessName: string, bookingToken: string) => { subject: string; body: string },
): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const row = await getLeadContext(tx, payload.tenantId, payload.leadId);
    if (!row || row.lead.stage !== "new") return;
    const message = renderMessage(row.tenant.businessName, row.lead.bookingToken);
    await sendToCustomer(tx, payload.tenantId, row.customer, row.lead.id, templateKey, message);
  });
}

export function handleNoBookingNudge4h(payload: LeadJobPayload): Promise<void> {
  return handleNoBookingNudge(payload, "no_booking_nudge_4h", noBookingNudge4hMessage);
}

export function handleNoBookingNudge2d(payload: LeadJobPayload): Promise<void> {
  return handleNoBookingNudge(payload, "no_booking_nudge_2d", noBookingNudge2dMessage);
}

export async function handleMarkCold7d(payload: LeadJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const row = await getLeadContext(tx, payload.tenantId, payload.leadId);
    if (!row || row.lead.stage !== "new") return;
    await closeLead(tx, payload.tenantId, payload.leadId, { type: "system" });
  });
}

async function getVisitContext(tx: AppTx, tenantId: string, visitId: string) {
  const [row] = await tx
    .select({ visit: visits, lead: leads, customer: customers, tenant: tenants })
    .from(visits)
    .innerJoin(leads, eq(leads.id, visits.leadId))
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .innerJoin(tenants, eq(tenants.id, visits.tenantId))
    .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)));
  return row;
}

export async function handleSendVisitConfirmation(payload: VisitJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const row = await getVisitContext(tx, payload.tenantId, payload.visitId);
    if (!row) return;
    const message = visitConfirmationMessage(row.tenant.businessName, row.visit.startAt);
    await sendToCustomer(tx, payload.tenantId, row.customer, row.lead.id, "visit_confirmation", message);
  });
}

export async function handleSendVisitReminder(payload: VisitJobPayload): Promise<void> {
  await withSystemTenantContext(payload.tenantId, async (tx) => {
    const row = await getVisitContext(tx, payload.tenantId, payload.visitId);
    if (!row || row.visit.status !== "scheduled") return;
    const message = visitReminderMessage(row.tenant.businessName, row.visit.startAt);
    await sendToCustomer(tx, payload.tenantId, row.customer, row.lead.id, "visit_reminder", message);
  });
}
