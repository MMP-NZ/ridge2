import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { listLeads } from "@/lib/crm/queries";
import type { LeadStage } from "@/db/schema";
import { advanceLeadAction, closeLeadAction } from "./actions";

const STAGE_TABS: { value: LeadStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "booked", label: "Booked" },
  { value: "visited", label: "Visited" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const SOURCE_LABELS: Record<string, string> = {
  juno_ads: "Juno ads",
  juno_website: "Website",
  juno_referral: "Referral",
  roofer_own: "Your own",
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects; keeps TS happy

  const { stage: stageParam } = await searchParams;
  const activeStage: LeadStage = (STAGE_TABS.find((t) => t.value === stageParam)?.value ?? "new") as LeadStage;

  const leadsForStage = await listLeads(session.tenantId, activeStage);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Link href="/leads/new" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          + Add lead
        </Link>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {STAGE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/leads?stage=${tab.value}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              tab.value === activeStage ? "border-accent bg-accent text-white" : "border-border text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {leadsForStage.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          <p>No leads in this stage.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {leadsForStage.map((lead) => (
            <li key={lead.id} className="rounded-xl border border-border bg-surface p-4">
              <Link href={`/customers/${lead.customerId}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{lead.customerName}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">
                    {SOURCE_LABELS[lead.source] ?? lead.source}
                  </span>
                </div>
                <span className="text-sm text-muted">{lead.propertyAddress}</span>
              </Link>

              {activeStage !== "won" && activeStage !== "lost" ? (
                <div className="mt-3 flex gap-2">
                  <form action={advanceLeadAction} className="flex-1">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
                      Move forward
                    </button>
                  </form>
                  <form action={closeLeadAction}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">
                      Close
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
