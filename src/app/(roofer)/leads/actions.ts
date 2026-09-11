"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { advanceLeadStage, closeLead, createLead } from "@/lib/crm/leads";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import type { LeadSource } from "@/db/schema";

async function requireSession() {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");
  return session;
}

export async function advanceLeadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return;

  await withRooferAccess(session.tenantId, (tx) =>
    advanceLeadStage(tx, session.tenantId, leadId, { type: "roofer", id: session.rooferUserId }),
  );
  revalidatePath("/leads");
  revalidatePath("/today");
}

export async function closeLeadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return;

  await withRooferAccess(session.tenantId, (tx) =>
    closeLead(tx, session.tenantId, leadId, { type: "roofer", id: session.rooferUserId }),
  );
  revalidatePath("/leads");
  revalidatePath("/today");
}

const MANUAL_ADD_SOURCES: LeadSource[] = ["roofer_own", "juno_referral"];

export interface AddLeadState {
  error?: string;
}

export async function addLeadAction(_prevState: AddLeadState, formData: FormData): Promise<AddLeadState> {
  const session = await requireSession();

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const sourceInput = String(formData.get("source") ?? "roofer_own");
  const source = (MANUAL_ADD_SOURCES as string[]).includes(sourceInput) ? (sourceInput as LeadSource) : "roofer_own";

  if (!name || !address || (!phone && !email)) {
    return { error: "Enter a name, an address, and a phone or email." };
  }

  const leadId = await withRooferAccess(session.tenantId, async (tx) => {
    const customer = await findOrCreateCustomer(tx, session.tenantId, { name, phone: phone || undefined, email: email || undefined });
    const property = await findOrCreateProperty(tx, session.tenantId, customer.id, address);
    const lead = await createLead(
      tx,
      session.tenantId,
      { customerId: customer.id, propertyId: property.id, source },
      { type: "roofer", id: session.rooferUserId },
    );
    return lead.id;
  });

  revalidatePath("/leads");
  revalidatePath("/today");
  redirect(`/leads?added=${leadId}`);
}
