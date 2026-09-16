import Link from "next/link";
import { requireStaffSession } from "@/lib/auth/current-session";
import { listClients } from "@/lib/staff/clients";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { Badge, Card, EmptyState, PageHeader, Screen, SectionHeading } from "@/components/ui";
import { ShieldIcon } from "@/components/icons";

const XERO_TONE = {
  connected: "accent-soft",
  needs_reconnect: "danger-soft",
  not_connected: "outline",
} as const;

const XERO_LABEL = {
  connected: "Xero",
  needs_reconnect: "Xero — reconnect",
  not_connected: "No Xero",
} as const;

export default async function StaffClientsPage() {
  await requireStaffSession();
  const clients = await listClients();

  const needingAttention = clients.filter(
    (client) => client.xero === "needs_reconnect" || (client.adBalanceCents !== null && client.adBalanceCents <= 20_000),
  );

  return (
    <Screen>
      <PageHeader
        title="Clients"
        description={
          clients.length === 0
            ? "No roofers on the platform yet."
            : `${clients.length} ${clients.length === 1 ? "roofer" : "roofers"} on the platform.`
        }
      />

      {needingAttention.length > 0 ? (
        <Card tone="danger" className="flex flex-col gap-1">
          <p className="text-body font-semibold">
            {needingAttention.length} needing attention
          </p>
          <p className="text-caption text-muted">
            {needingAttention.map((client) => client.tenant.businessName).join(", ")} — low ad balance or a broken Xero
            connection.
          </p>
        </Card>
      ) : null}

      {clients.length === 0 ? (
        <EmptyState
          icon={<ShieldIcon className="h-6 w-6" />}
          title="No clients yet"
          description="Roofers appear here once their tenant is created."
        />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading>All clients</SectionHeading>
          {clients.map(({ tenant, xero, metaConnected, adBalanceCents, leadCount }) => (
            <Link key={tenant.id} href={`/staff/clients/${tenant.id}`} className="block">
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-title font-semibold tracking-[-0.01em]">{tenant.businessName}</p>
                    <p className="mt-0.5 text-caption text-muted">
                      {tenant.plan === "max" ? "MAX" : "Basic"} · {formatNzd(tenant.monthlyFeeCents)}/mo ·{" "}
                      {leadCount} {leadCount === 1 ? "lead" : "leads"}
                    </p>
                  </div>
                  {adBalanceCents !== null ? (
                    <span className="shrink-0 text-body font-semibold tabular-nums">
                      {formatNzd(adBalanceCents)}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={XERO_TONE[xero]}>{XERO_LABEL[xero]}</Badge>
                  <Badge tone={metaConnected ? "accent-soft" : "outline"}>{metaConnected ? "Meta" : "No Meta"}</Badge>
                  {tenant.freeMonthEndsAt && tenant.freeMonthEndsAt > new Date() ? (
                    <Badge tone="warning">Free until {formatNzDate(tenant.freeMonthEndsAt)}</Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </Screen>
  );
}
