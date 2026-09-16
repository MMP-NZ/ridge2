"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/auth/current-session";
import { recordTopUp } from "@/lib/ads/balance";
import { setOnboardingStep, logMaxHours } from "@/lib/staff/onboarding";
import { parsePriceToCents } from "@/lib/quotes/parse";

export interface ClientActionState {
  error?: string;
  savedAt?: string;
}

export async function toggleOnboardingStepAction(formData: FormData): Promise<void> {
  const session = await requireStaffSession();
  const tenantId = String(formData.get("tenantId") ?? "");
  const stepKey = String(formData.get("stepKey") ?? "");
  const done = String(formData.get("done") ?? "") === "true";
  if (!tenantId || !stepKey) redirect("/staff");

  await setOnboardingStep(session.staffUserId, tenantId, stepKey, done);
  revalidatePath(`/staff/clients/${tenantId}`);
}

/**
 * Records a prepaid ad top-up. M3 built and tested recordTopUp with a note
 * that its form belonged to M7 — this is that form.
 */
export async function recordTopUpAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const session = await requireStaffSession();
  const tenantId = String(formData.get("tenantId") ?? "");
  const amountCents = parsePriceToCents(String(formData.get("amount") ?? ""));
  const note = String(formData.get("note") ?? "").trim();

  if (!tenantId) return { error: "Client not found." };
  if (amountCents === null || amountCents <= 0) return { error: "Enter an amount, like 500.00." };

  await recordTopUp(session.staffUserId, tenantId, amountCents, note || undefined);

  revalidatePath(`/staff/clients/${tenantId}`);
  return { savedAt: new Date().toISOString() };
}

export async function logMaxHoursAction(
  _prev: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const session = await requireStaffSession();
  const tenantId = String(formData.get("tenantId") ?? "");
  const hours = Number(String(formData.get("hours") ?? ""));
  const note = String(formData.get("note") ?? "").trim();

  if (!tenantId) return { error: "Client not found." };
  if (!Number.isFinite(hours) || hours <= 0) return { error: "Enter the time in hours, like 1.5." };

  await logMaxHours(session.staffUserId, tenantId, new Date(), Math.round(hours * 60), note || undefined);

  revalidatePath(`/staff/clients/${tenantId}`);
  return { savedAt: new Date().toISOString() };
}
