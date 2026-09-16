import Link from "next/link";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { listLeads } from "@/lib/crm/queries";
import type { LeadStage } from "@/db/schema";
import { InboxIcon, PinIcon, PlusIcon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  Screen,
} from "@/components/ui";
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

const EMPTY_COPY: Record<LeadStage, { title: string; description: string }> = {
  new: {
    title: "No new leads",
    description:
      "Enquiries from your website and ads land here on their own. Add one by hand if someone rings you.",
  },
  booked: {
    title: "Nothing booked yet",
    description: "Leads show here once the customer picks a quote day slot.",
  },
  visited: {
    title: "No visits written up",
    description: "Write up a site visit and the lead moves through to here.",
  },
  quoted: {
    title: "No quotes out",
    description: "Leads land here once you've sent the customer a quote.",
  },
  won: {
    title: "No jobs won yet",
    description: "Accepted quotes show up here, ready to schedule.",
  },
  lost: {
    title: "Nothing lost",
    description: "Leads you close off end up here, so nothing disappears.",
  },
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects; keeps TS happy

  const { stage: stageParam } = await searchParams;
  const activeStage: LeadStage = (STAGE_TABS.find((t) => t.value === stageParam)
    ?.value ?? "new") as LeadStage;

  const leadsForStage = await listLeads(session.tenantId, activeStage);
  const closed = activeStage === "won" || activeStage === "lost";

  return (
    <Screen>
      <PageHeader
        title="Leads"
        action={
          <LinkButton
            href="/leads/new"
            size="sm"
            icon={<PlusIcon className="h-4 w-4" strokeWidth={2.25} />}
          >
            Add
          </LinkButton>
        }
      />

      {/* Full-bleed scroller: the tab strip runs past the page gutter rather
          than forcing the page itself to scroll sideways. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {STAGE_TABS.map((tab) => {
            const active = tab.value === activeStage;
            return (
              <Link
                key={tab.value}
                href={`/leads?stage=${tab.value}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-pill border px-4 text-body font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                  active
                    ? "border-accent bg-accent text-accent-contrast shadow-card"
                    : "border-border-strong bg-surface text-muted"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {leadsForStage.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-6 w-6" />}
          title={EMPTY_COPY[activeStage].title}
          description={EMPTY_COPY[activeStage].description}
          action={
            activeStage === "new" ? (
              <LinkButton href="/leads/new" variant="secondary" block>
                Add a lead
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {leadsForStage.map((lead) => (
            <Card
              as="li"
              key={lead.id}
              padding="none"
              className="overflow-hidden"
            >
              <Link
                href={`/customers/${lead.customerId}`}
                className="flex flex-col gap-1 p-4 transition-colors active:bg-surface-sunken"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-title font-semibold tracking-[-0.01em]">
                    {lead.customerName}
                  </span>
                  <Badge tone="neutral">
                    {SOURCE_LABELS[lead.source] ?? lead.source}
                  </Badge>
                </div>
                <span className="flex items-start gap-1.5 text-body text-muted">
                  <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">{lead.propertyAddress}</span>
                </span>
              </Link>

              {closed ? null : (
                <div className="flex gap-2 border-t border-border p-3">
                  <form action={advanceLeadAction} className="min-w-0 flex-1">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <Button type="submit" block>
                      Move forward
                    </Button>
                  </form>
                  <form action={closeLeadAction} className="shrink-0">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <Button type="submit" variant="danger">
                      Close
                    </Button>
                  </form>
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </Screen>
  );
}
