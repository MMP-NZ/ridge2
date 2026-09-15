import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { quotes, customers, properties, visits, leads } from "@/db/schema";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { QuotesIcon } from "@/components/icons";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Screen, SectionHeading } from "@/components/ui";

const STATUS_TONE = {
  draft: "outline",
  sent: "accent-soft",
  accepted: "accent",
  declined: "neutral",
  superseded: "neutral",
} as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  superseded: "Replaced",
};

export default async function QuotesPage() {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { rows, readyToQuote } = await withRooferAccess(session.tenantId, async (tx) => {
    const rows = await tx
      .select({ quote: quotes, customerName: customers.name, propertyAddress: properties.address })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .innerJoin(properties, eq(properties.id, quotes.propertyId))
      .where(eq(quotes.tenantId, session.tenantId))
      .orderBy(desc(quotes.createdAt));

    // Visits written up but not yet quoted — the whole point of the
    // milestone is that this list stays empty by the end of the day.
    const readyToQuote = await tx
      .select({ visitId: visits.id, customerName: customers.name, propertyAddress: properties.address })
      .from(visits)
      .innerJoin(leads, eq(leads.id, visits.leadId))
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .innerJoin(properties, eq(properties.id, leads.propertyId))
      .where(and(eq(visits.tenantId, session.tenantId), eq(visits.status, "completed"), eq(leads.stage, "visited")))
      .orderBy(desc(visits.startAt));

    return { rows, readyToQuote };
  });

  return (
    <Screen>
      <PageHeader
        title="Quotes"
        description={
          rows.length === 0
            ? "Quotes you build from a site visit show up here."
            : "Newest first. A sent quote can't be edited — revise it instead."
        }
      />

      {readyToQuote.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Ready to quote</SectionHeading>
          {readyToQuote.map((visit) => (
            <Card key={visit.visitId} padding="none" className="overflow-hidden">
              <div className="p-4">
                <p className="text-title font-semibold tracking-[-0.01em]">{visit.customerName}</p>
                <p className="mt-0.5 text-caption text-muted">{visit.propertyAddress}</p>
              </div>
              <div className="border-t border-border p-3">
                <LinkButton href={`/quotes/new?visitId=${visit.visitId}`} block>
                  Build the quote
                </LinkButton>
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<QuotesIcon className="h-6 w-6" />}
          title="No quotes yet"
          description="Write up a site visit and the quote builder starts from your price book."
          action={
            <LinkButton href="/today" variant="secondary" block>
              See today&apos;s visits
            </LinkButton>
          }
        />
      ) : (
        <section className="flex flex-col gap-3">
          <SectionHeading>All quotes</SectionHeading>
          {rows.map(({ quote, customerName, propertyAddress }) => (
            <Link key={quote.id} href={`/quotes/${quote.id}`} className="block">
              <Card className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-title font-semibold tracking-[-0.01em]">{customerName}</p>
                  <p className="mt-0.5 truncate text-caption text-muted">{propertyAddress}</p>
                  <p className="mt-1.5 text-caption text-muted">
                    {quote.sentAt ? `Sent ${formatNzDate(quote.sentAt)}` : `Started ${formatNzDate(quote.createdAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={STATUS_TONE[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
                  <span className="text-title font-semibold tabular-nums">
                    {formatNzd(quote.totalIncGstCents)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </Screen>
  );
}
