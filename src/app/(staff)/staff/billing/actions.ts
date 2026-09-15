"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/current-session";
import { runBilling } from "@/lib/billing/run";

export interface BillingRunState {
  error?: string;
  raised?: number;
  skippedAlreadyBilled?: number;
  skippedNothingOwing?: number;
}

/**
 * Raises the month's invoices, after a person has looked at the preview.
 *
 * Deliberately not automatic (see docs/decisions.md): these are bills to
 * real customers, and the first months are when you most want eyes on the
 * numbers before they go out.
 */
export async function runBillingAction(_prev: BillingRunState, formData: FormData): Promise<BillingRunState> {
  await requireStaffSession();

  const month = String(formData.get("month") ?? "");
  const parsed = month ? new Date(month) : new Date();
  if (Number.isNaN(parsed.getTime())) return { error: "Pick a month first." };

  const result = await runBilling(parsed);

  revalidatePath("/staff/billing");
  return {
    raised: result.raised.length,
    skippedAlreadyBilled: result.skippedAlreadyBilled,
    skippedNothingOwing: result.skippedNothingOwing,
  };
}
