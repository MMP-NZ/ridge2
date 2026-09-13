import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getAdsOverview } from "@/lib/ads/queries";
import { formatNzd } from "@/lib/money";

const OUTCOME_MESSAGES: Record<string, string> = {
  connected: "Facebook Page connected.",
  no_pages: "That Facebook account doesn't manage any Pages yet.",
  error: "Something went wrong connecting Facebook — try again.",
};

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ metaConnect?: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { metaConnect } = await searchParams;
  const overview = await getAdsOverview(session.tenantId);
  const isLow = overview.hasBalanceRecord && overview.balanceCents <= overview.lowBalanceThresholdCents;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Advertising</h1>

      {metaConnect && OUTCOME_MESSAGES[metaConnect] ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">{OUTCOME_MESSAGES[metaConnect]}</div>
      ) : null}

      <section className={`rounded-xl border p-4 ${isLow ? "border-danger" : "border-border"} bg-surface`}>
        <p className="text-sm text-muted">Ad balance</p>
        <p className={`text-2xl font-semibold ${isLow ? "text-danger" : ""}`}>{formatNzd(overview.balanceCents)}</p>
        {isLow ? (
          <p className="mt-1 text-sm text-danger">
            {overview.alertSent ? "Getting low — Juno Logic has been notified." : "Getting low."}
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Spend this month</p>
          <p className="text-lg font-semibold">{formatNzd(overview.spendThisMonthCents)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Leads from ads</p>
          <p className="text-lg font-semibold">{overview.leadsThisMonth}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Cost per lead</p>
          <p className="text-lg font-semibold">
            {overview.costPerLeadCents === null ? "—" : formatNzd(overview.costPerLeadCents)}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium">Facebook / Instagram ads</p>
        {overview.metaConnected ? (
          <p className="mt-1 text-sm text-muted">Connected: {overview.metaPageName}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Not connected yet.</p>
            <a href="/api/meta/connect/start" className="mt-3 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">
              Connect Facebook Page
            </a>
          </>
        )}
      </section>
    </main>
  );
}
