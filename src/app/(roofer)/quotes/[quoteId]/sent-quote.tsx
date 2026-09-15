import { Badge, Button, Card, CardTitle } from "@/components/ui";
import { formatNzd } from "@/lib/money";
import { formatNzDateTime } from "@/lib/time";
import { formatQuantity } from "@/lib/quotes/parse";
import type { QuoteLine, QuoteStatus } from "@/db/schema";
import { reviseQuoteAction } from "../actions";

/**
 * A quote that has left the roofer's hands. Read-only on purpose: these are
 * the figures the customer was shown, and from M6 the figures commission is
 * owed on. Changing anything means a revision.
 */
export function SentQuote({
  quoteId,
  status,
  quoteToken,
  lines,
  subtotalExGstCents,
  gstCents,
  totalIncGstCents,
  acceptedName,
  acceptedAt,
  declineReason,
}: {
  quoteId: string;
  status: QuoteStatus;
  quoteToken: string;
  lines: QuoteLine[];
  subtotalExGstCents: number;
  gstCents: number;
  totalIncGstCents: number;
  acceptedName: string | null;
  acceptedAt: Date | null;
  declineReason: string | null;
}) {
  const customerUrl = `/quote/${quoteToken}`;

  return (
    <div className="flex flex-col gap-4">
      {status === "accepted" && acceptedName ? (
        <Card tone="accent" className="flex flex-col gap-1">
          <p className="text-body font-semibold">Accepted by {acceptedName}</p>
          {acceptedAt ? <p className="text-caption text-muted">{formatNzDateTime(acceptedAt)}</p> : null}
          <p className="mt-1 text-caption text-muted">It&apos;s in your jobs list, ready to schedule.</p>
        </Card>
      ) : null}

      {status === "declined" ? (
        <Card tone="quiet" className="flex flex-col gap-1">
          <p className="text-body font-semibold">Not going ahead</p>
          <p className="text-caption text-muted">
            {declineReason ? `"${declineReason}"` : "No reason given."} The lead is closed and the follow-ups have
            stopped.
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <CardTitle>What was quoted</CardTitle>
        <ul className="flex flex-col gap-2.5">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 text-body">
              <div className="min-w-0">
                <p className="font-medium">{line.description}</p>
                <p className="text-caption text-muted">
                  {formatQuantity(line.quantityThousandths)} × {formatNzd(line.unitPriceCents)}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatNzd(line.lineTotalExGstCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-body">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal (ex GST)</dt>
            <dd className="tabular-nums">{formatNzd(subtotalExGstCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">GST</dt>
            <dd className="tabular-nums">{formatNzd(gstCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-title font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatNzd(totalIncGstCents)}</dd>
          </div>
        </dl>
      </Card>

      {status === "sent" ? (
        <Card className="flex flex-col gap-2">
          <CardTitle>
            Waiting on the customer <Badge tone="outline">Sent</Badge>
          </CardTitle>
          <p className="text-caption text-muted">
            They can accept it at{" "}
            <a href={customerUrl} className="text-accent underline" target="_blank" rel="noreferrer">
              their quote page
            </a>
            . We&apos;ll chase them at 3 days and again at 7 if they haven&apos;t.
          </p>
        </Card>
      ) : null}

      {status === "sent" || status === "declined" ? (
        <form action={reviseQuoteAction}>
          <input type="hidden" name="quoteId" value={quoteId} />
          <Button type="submit" variant="secondary" block>
            Revise this quote
          </Button>
          <p className="mt-2 text-center text-caption text-muted">
            Makes a new quote from these lines. The old one stays on record as replaced.
          </p>
        </form>
      ) : null}
    </div>
  );
}
