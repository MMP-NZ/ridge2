import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { quotes, customers, properties } from "@/db/schema";
import { listQuoteLines } from "@/lib/quotes/quotes";
import { listPriceBook } from "@/lib/price-book/items";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { Badge, Card, CardTitle, PageHeader, Screen } from "@/components/ui";
import { QuoteBuilder } from "./quote-builder";
import { SentQuote } from "./sent-quote";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  superseded: "Replaced",
};

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { quoteId } = await params;
  const { sent } = await searchParams;

  const data = await withRooferAccess(session.tenantId, async (tx) => {
    const [row] = await tx
      .select({ quote: quotes, customerName: customers.name, propertyAddress: properties.address })
      .from(quotes)
      .innerJoin(customers, eq(customers.id, quotes.customerId))
      .innerJoin(properties, eq(properties.id, quotes.propertyId))
      .where(and(eq(quotes.tenantId, session.tenantId), eq(quotes.id, quoteId)));
    if (!row) return null;

    return {
      ...row,
      lines: await listQuoteLines(tx, session.tenantId, quoteId),
      priceBook: await listPriceBook(tx, session.tenantId),
    };
  });

  if (!data) notFound();
  const { quote } = data;
  const editable = quote.status === "draft";

  return (
    <Screen>
      <PageHeader
        backHref="/quotes"
        backLabel="Quotes"
        eyebrow={editable ? "Building a quote" : "Quote"}
        title={data.customerName}
        description={data.propertyAddress}
        action={
          <Badge tone={quote.status === "accepted" ? "accent" : quote.status === "draft" ? "outline" : "neutral"}>
            {STATUS_LABELS[quote.status]}
          </Badge>
        }
      />

      {sent ? (
        <Card tone="accent" className="flex flex-col gap-1">
          <p className="text-body font-semibold">Quote sent to {data.customerName}.</p>
          <p className="text-caption text-muted">
            They&apos;ll get a link to accept it online. If they don&apos;t, we&apos;ll chase them at 3 days and again
            at 7.
          </p>
        </Card>
      ) : null}

      {editable ? (
        <QuoteBuilder
          quoteId={quote.id}
          lines={data.lines.map((line) => ({
            description: line.description,
            kind: line.kind,
            quantityThousandths: line.quantityThousandths,
            unitPriceCents: line.unitPriceCents,
            priceBookItemId: line.priceBookItemId,
          }))}
          priceBook={data.priceBook.map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            unitPriceCents: item.unitPriceCents,
            unit: item.unit,
          }))}
          gstRateBp={quote.gstRateBp}
          estimatedDays={quote.estimatedDays}
        />
      ) : (
        <SentQuote
          quoteId={quote.id}
          status={quote.status}
          quoteToken={quote.quoteToken}
          lines={data.lines}
          subtotalExGstCents={quote.subtotalExGstCents}
          gstCents={quote.gstCents}
          totalIncGstCents={quote.totalIncGstCents}
          acceptedName={quote.acceptedName}
          acceptedAt={quote.acceptedAt}
          declineReason={quote.declineReason}
        />
      )}

      {quote.validUntil ? (
        <Card tone="quiet">
          <CardTitle>Valid until</CardTitle>
          <p className="mt-1 text-body">{formatNzDate(quote.validUntil)}</p>
          <p className="mt-1 text-caption text-muted">
            Sixty days from when it was written. Totals shown exclude GST until the summary — {formatNzd(quote.totalIncGstCents)} including
            GST.
          </p>
        </Card>
      ) : null}
    </Screen>
  );
}
