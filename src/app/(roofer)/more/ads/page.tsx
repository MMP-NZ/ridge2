import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getAdsOverview } from "@/lib/ads/queries";
import { formatNzd } from "@/lib/money";
import { MegaphoneIcon } from "@/components/icons";
import {
  Badge,
  Card,
  CardTitle,
  FormMessage,
  LinkButton,
  PageHeader,
  Screen,
  SectionHeading,
  StatTile,
} from "@/components/ui";

const OUTCOME_MESSAGES: Record<
  string,
  { tone: "success" | "error" | "info"; text: string }
> = {
  connected: { tone: "success", text: "Facebook Page connected." },
  no_pages: {
    tone: "info",
    text: "That Facebook account doesn't manage any Pages yet.",
  },
  error: {
    tone: "error",
    text: "Something went wrong connecting Facebook — try again.",
  },
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
  const isLow =
    overview.hasBalanceRecord &&
    overview.balanceCents <= overview.lowBalanceThresholdCents;
  const outcome = metaConnect ? OUTCOME_MESSAGES[metaConnect] : undefined;

  return (
    <Screen>
      <PageHeader
        backHref="/more"
        backLabel="More"
        title="Advertising"
        description="Juno Logic runs the campaigns. You prepay the ad spend, and it's passed on at cost."
      />

      {outcome ? (
        <FormMessage tone={outcome.tone}>{outcome.text}</FormMessage>
      ) : null}

      <StatTile
        label="Ad balance"
        value={formatNzd(overview.balanceCents)}
        size="lg"
        tone={isLow ? "danger" : "default"}
        hint={
          isLow
            ? overview.alertSent
              ? "Getting low — Juno Logic has been notified."
              : "Getting low. Campaigns pause when it runs out."
            : undefined
        }
      />

      <section className="flex flex-col gap-3">
        <SectionHeading>This month</SectionHeading>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Spend"
            value={formatNzd(overview.spendThisMonthCents)}
          />
          <StatTile label="Leads from ads" value={overview.leadsThisMonth} />
          <StatTile
            label="Cost per lead"
            value={
              overview.costPerLeadCents === null
                ? "—"
                : formatNzd(overview.costPerLeadCents)
            }
            hint={
              overview.costPerLeadCents === null
                ? "No ad leads yet this month."
                : undefined
            }
            className="col-span-2"
          />
        </div>
      </section>

      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-accent-soft text-accent">
              <MegaphoneIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <CardTitle>Facebook &amp; Instagram</CardTitle>
              <p className="text-caption text-muted">
                {overview.metaConnected
                  ? overview.metaPageName
                  : "Lead ads aren't connected yet."}
              </p>
            </div>
          </div>
          {overview.metaConnected ? (
            <Badge tone="accent-soft">Connected</Badge>
          ) : null}
        </div>

        {overview.metaConnected ? null : (
          <LinkButton href="/api/meta/connect/start" external block>
            Connect Facebook Page
          </LinkButton>
        )}
      </Card>
    </Screen>
  );
}
