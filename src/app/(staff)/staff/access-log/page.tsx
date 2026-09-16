import { requireStaffSession } from "@/lib/auth/current-session";
import { listAccessLog } from "@/lib/staff/clients";
import { formatNzDateTime } from "@/lib/time";
import { Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import { ShieldIcon } from "@/components/icons";

export default async function AccessLogPage() {
  await requireStaffSession();
  const entries = await listAccessLog();

  return (
    <Screen>
      <PageHeader
        backHref="/staff"
        backLabel="Clients"
        title="Access log"
        description="Every time Juno Logic staff touch a roofer's data. He sees the same entries on his own account."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={<ShieldIcon className="h-6 w-6" />}
          title="Nothing logged yet"
          description="Opening a client's records writes an entry here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Card as="li" key={entry.id} className="flex flex-col gap-0.5">
              <p className="text-body font-medium">{entry.businessName}</p>
              <p className="text-caption text-muted">
                {entry.action} · {entry.staffName}
              </p>
              <p className="text-caption text-muted">{formatNzDateTime(entry.occurredAt)}</p>
            </Card>
          ))}
        </ul>
      )}
    </Screen>
  );
}
