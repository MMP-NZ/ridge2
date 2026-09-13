import { eq } from "drizzle-orm";
import { adBalances, adBalanceEntries, tenants, rooferUsers, type AdPlatform } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { withStaffTenantAccess } from "@/lib/auth/with-tenant-context";
import { getSmsSender, getEmailSender } from "@/lib/messaging/transport";
import { formatNzd } from "@/lib/money";

async function getOrCreateBalance(tx: AppTx, tenantId: string) {
  const [existing] = await tx.select().from(adBalances).where(eq(adBalances.tenantId, tenantId));
  if (existing) return existing;
  const [created] = await tx.insert(adBalances).values({ tenantId }).returning();
  return created;
}

/** Sends a low-balance notice to the roofer (direct send — this isn't a customer conversation, so it doesn't go through the `messages` table) and flags Juno Logic ops to consider pausing campaigns manually (automatic pausing is P2). */
async function sendLowBalanceAlert(tx: AppTx, tenantId: string, newBalanceCents: number, thresholdCents: number): Promise<void> {
  const [roofer] = await tx.select().from(rooferUsers).where(eq(rooferUsers.tenantId, tenantId));
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));

  const rooferMessage = `Your ad balance is down to ${formatNzd(newBalanceCents)} — top up soon to keep your campaigns running.`;
  if (roofer?.phone) await getSmsSender().send(roofer.phone, rooferMessage);
  if (roofer?.email) await getEmailSender().send(roofer.email, "Your ad balance is low", rooferMessage);

  const opsEmail = process.env.JUNO_OPS_EMAIL;
  if (opsEmail) {
    await getEmailSender().send(
      opsEmail,
      `Low ad balance: ${tenant?.businessName ?? tenantId}`,
      `Balance is now ${formatNzd(newBalanceCents)} (threshold ${formatNzd(thresholdCents)}). Consider pausing campaigns manually until topped up.`,
    );
  }
}

/** Staff-only (audited via withStaffTenantAccess, same as changeLeadSource — M7's admin console is the eventual UI for this). */
export async function recordTopUp(staffUserId: string, tenantId: string, amountCents: number, note?: string): Promise<number> {
  return withStaffTenantAccess(staffUserId, tenantId, "ad_balance.topup", async (tx) => {
    const balance = await getOrCreateBalance(tx, tenantId);
    const newBalanceCents = balance.balanceCents + amountCents;

    await tx.insert(adBalanceEntries).values({ tenantId, type: "topup", amountCents, note, staffUserId });
    await tx
      .update(adBalances)
      .set({
        balanceCents: newBalanceCents,
        updatedAt: new Date(),
        // Back above threshold — clear the flag so a future dip alerts again.
        lastAlertSentAt: newBalanceCents > balance.lowBalanceThresholdCents ? null : balance.lastAlertSentAt,
      })
      .where(eq(adBalances.tenantId, tenantId));

    return newBalanceCents;
  });
}

export interface RecordSpendOptions {
  platform?: AdPlatform;
  campaign?: string;
  note?: string;
}

/** Staff-only (audited). Fires the low-balance alert at most once per threshold-crossing — see recordTopUp for how it re-arms. */
export async function recordSpend(
  staffUserId: string,
  tenantId: string,
  amountCents: number,
  options?: RecordSpendOptions,
): Promise<number> {
  return withStaffTenantAccess(staffUserId, tenantId, "ad_balance.spend", async (tx) => {
    const balance = await getOrCreateBalance(tx, tenantId);
    const newBalanceCents = balance.balanceCents - amountCents;
    const shouldAlert = newBalanceCents <= balance.lowBalanceThresholdCents && !balance.lastAlertSentAt;

    await tx.insert(adBalanceEntries).values({
      tenantId,
      type: "spend",
      amountCents,
      platform: options?.platform,
      campaign: options?.campaign,
      note: options?.note,
      staffUserId,
    });

    await tx
      .update(adBalances)
      .set({
        balanceCents: newBalanceCents,
        updatedAt: new Date(),
        ...(shouldAlert ? { lastAlertSentAt: new Date() } : {}),
      })
      .where(eq(adBalances.tenantId, tenantId));

    if (shouldAlert) {
      await sendLowBalanceAlert(tx, tenantId, newBalanceCents, balance.lowBalanceThresholdCents);
    }

    return newBalanceCents;
  });
}
