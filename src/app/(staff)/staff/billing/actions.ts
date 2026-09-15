"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/current-session";
import { runBilling } from "@/lib/billing/run";
import { getXeroClient } from "@/lib/xero/client";
import { savePlatformTokens } from "@/lib/billing/platform-xero";
import { withStaffTenantContext } from "@/db/client";

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

/**
 * Connects Juno Logic's own Xero — the books invoices to roofers are raised
 * in, not any roofer's. With FAKE_XERO on (the default) the stand-in hands
 * back tokens immediately.
 */
export async function connectPlatformXeroAction(): Promise<void> {
  await requireStaffSession();

  const tokens = await getXeroClient().exchangeCode("fake-code", "fake-redirect");
  await withStaffTenantContext("00000000-0000-0000-0000-000000000000", (tx) => savePlatformTokens(tx, tokens));

  revalidatePath("/staff/billing");
}
