import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { countNewLeads, countLeadsNeedingCall } from "@/lib/crm/queries";
import { listVisits, mapsSearchUrl } from "@/lib/booking/queries";
import { formatNzDateTime } from "@/lib/time";

export default async function TodayPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [newLeadCount, needsCallCount, todaysVisits] = await Promise.all([
    countNewLeads(session.tenantId),
    countLeadsNeedingCall(session.tenantId),
    listVisits(session.tenantId, now, endOfDay),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Today</h1>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-medium">Today&apos;s visits</h2>
        {todaysVisits.length === 0 ? (
          <p className="text-sm text-muted">No visits booked for today.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todaysVisits.map((visit) => (
              <li key={visit.id} className="text-sm">
                <span className="font-medium">{formatNzDateTime(visit.startAt).split(", ").pop()}</span> {visit.customerName} —{" "}
                <a href={mapsSearchUrl(visit.propertyAddress)} className="text-accent underline" target="_blank" rel="noreferrer">
                  {visit.propertyAddress}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/leads?stage=new"
        className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
      >
        <span className="font-medium">Leads waiting</span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-white">{newLeadCount}</span>
      </Link>

      {needsCallCount > 0 ? (
        <Link
          href="/leads?stage=new"
          className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
        >
          <span className="font-medium">Needs a call</span>
          <span className="rounded-full bg-danger px-2.5 py-0.5 text-sm font-semibold text-white">{needsCallCount}</span>
        </Link>
      ) : null}
    </main>
  );
}
