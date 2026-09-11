import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { countNewLeads } from "@/lib/crm/queries";

export default async function TodayPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const newLeadCount = await countNewLeads(session.tenantId);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Today</h1>

      <Link
        href="/leads?stage=new"
        className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
      >
        <span className="font-medium">Leads waiting</span>
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-white">{newLeadCount}</span>
      </Link>

      <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
        <p>Nothing else here yet.</p>
        <p className="mt-1 text-sm">Visits, jobs and money owed show up here from later milestones.</p>
      </div>
    </main>
  );
}
