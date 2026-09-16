import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { getConnection } from "@/lib/xero/connection";
import { formatNzDateTime } from "@/lib/time";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { Badge, Button, Card, CardTitle, PageHeader, Screen } from "@/components/ui";
import { connectXeroAction, disconnectXeroAction } from "./actions";

export default async function XeroPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const connection = await withRooferAccess(session.tenantId, (tx) => getConnection(tx, session.tenantId));
  const needsReconnect = Boolean(connection?.needsReconnectAt);
  const usingFake = process.env.FAKE_XERO !== "false";

  return (
    <Screen>
      <PageHeader
        backHref="/more"
        backLabel="More"
        title="Xero"
        description="Invoices for finished jobs go into your own Xero as drafts, for you to check and approve."
        action={
          connection ? (
            <Badge tone={needsReconnect ? "danger-soft" : "accent"}>
              {needsReconnect ? "Reconnect" : "Connected"}
            </Badge>
          ) : null
        }
      />

      {needsReconnect ? (
        <Card tone="danger" className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-body font-semibold">Xero needs reconnecting</p>
              <p className="mt-1 text-caption text-muted">
                We&apos;ve lost access to your Xero — it usually means the connection was removed from Xero&apos;s side.
                Nothing has been lost: finished jobs are waiting and will be invoiced as soon as you reconnect.
              </p>
            </div>
          </div>
          <form action={connectXeroAction}>
            <Button type="submit" block>
              Reconnect Xero
            </Button>
          </form>
        </Card>
      ) : null}

      {!connection ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Connect your Xero</CardTitle>
          <p className="text-caption text-muted">
            Once connected, finishing a job creates a draft invoice in Xero from the quote your customer accepted. It
            stays a draft until you approve it — nothing is sent to a customer without you.
          </p>
          <form action={connectXeroAction}>
            <Button type="submit" size="lg" block>
              Connect Xero
            </Button>
          </form>
        </Card>
      ) : null}

      {connection && !needsReconnect ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <CheckIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-body font-semibold">{connection.organisationName ?? "Your Xero organisation"}</p>
              <p className="text-caption text-muted">Connected {formatNzDateTime(connection.connectedAt)}</p>
              {connection.lastSyncedAt ? (
                <p className="text-caption text-muted">
                  Payments last checked {formatNzDateTime(connection.lastSyncedAt)}
                </p>
              ) : (
                <p className="text-caption text-muted">Payments are checked twice a day.</p>
              )}
            </div>
          </div>

          <form action={disconnectXeroAction}>
            <Button type="submit" variant="secondary" block>
              Disconnect
            </Button>
          </form>
        </Card>
      ) : null}

      {usingFake ? (
        <Card tone="quiet">
          <p className="text-caption text-muted">
            <strong className="font-semibold text-foreground">Test mode.</strong> This is connected to a stand-in for
            Xero, not the real thing — nothing reaches a real set of accounts. Juno Logic&apos;s Xero app is still being
            set up.
          </p>
        </Card>
      ) : null}
    </Screen>
  );
}
