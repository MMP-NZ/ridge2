import { and, eq, gte, sum, count } from "drizzle-orm";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { adBalances, adBalanceEntries, leads, metaConnections } from "@/db/schema";

export interface AdsOverview {
  balanceCents: number;
  lowBalanceThresholdCents: number;
  // False for a tenant that's never had a top-up or spend recorded yet (no
  // ad_balances row exists — it's created lazily on first ledger entry, see
  // getOrCreateBalance). Without this, a never-funded $0 balance would look
  // identical to a genuinely depleted one.
  hasBalanceRecord: boolean;
  // True only once a low-balance alert has actually been sent for the
  // current low state (ad_balances.lastAlertSentAt is set) — so the UI
  // never claims Juno Logic was notified when it wasn't.
  alertSent: boolean;
  spendThisMonthCents: number;
  leadsThisMonth: number;
  costPerLeadCents: number | null; // null when there are no leads yet, to avoid a divide-by-zero
  metaConnected: boolean;
  metaPageName: string | null;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getAdsOverview(tenantId: string): Promise<AdsOverview> {
  return withRooferAccess(tenantId, async (tx) => {
    const [balance] = await tx.select().from(adBalances).where(eq(adBalances.tenantId, tenantId));

    const monthStart = startOfMonth();
    const [spendRow] = await tx
      .select({ total: sum(adBalanceEntries.amountCents) })
      .from(adBalanceEntries)
      .where(and(eq(adBalanceEntries.tenantId, tenantId), eq(adBalanceEntries.type, "spend"), gte(adBalanceEntries.createdAt, monthStart)));

    const [leadsRow] = await tx
      .select({ total: count() })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.source, "juno_ads"), gte(leads.createdAt, monthStart)));

    const [connection] = await tx.select().from(metaConnections).where(eq(metaConnections.tenantId, tenantId));

    const spendThisMonthCents = Number(spendRow?.total ?? 0);
    const leadsThisMonth = leadsRow?.total ?? 0;

    return {
      balanceCents: balance?.balanceCents ?? 0,
      lowBalanceThresholdCents: balance?.lowBalanceThresholdCents ?? 20_000,
      hasBalanceRecord: balance !== undefined,
      alertSent: balance?.lastAlertSentAt != null,
      spendThisMonthCents,
      leadsThisMonth,
      costPerLeadCents: leadsThisMonth > 0 ? Math.round(spendThisMonthCents / leadsThisMonth) : null,
      metaConnected: Boolean(connection?.webhookSubscribedAt),
      metaPageName: connection?.pageName ?? null,
    };
  });
}
