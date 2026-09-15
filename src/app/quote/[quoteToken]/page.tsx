import { notFound } from "next/navigation";
import Link from "next/link";
import { getQuotePageData } from "@/lib/quotes/public-lookup";
import { formatNzd } from "@/lib/money";
import { formatNzDate } from "@/lib/time";
import { formatQuantity } from "@/lib/quotes/parse";
import { PRODUCT_NAME } from "@/lib/config";
import { BrandMark } from "@/components/brand-mark";
import { CheckIcon, PinIcon } from "@/components/icons";
import { Button, Card, Field, FormMessage, TextArea, TextInput } from "@/components/ui";
import { acceptQuoteAction, declineQuoteAction } from "./actions";

const OUTCOME_MESSAGES: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  name_required: { tone: "error", text: "Please type your full name to accept the quote." },
  already_accepted: { tone: "info", text: "This quote was already accepted — nothing more to do." },
  not_acceptable: { tone: "error", text: "This quote can no longer be accepted. Get in touch and we'll sort it." },
};

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteToken: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { quoteToken } = await params;
  const { outcome } = await searchParams;

  const quote = await getQuotePageData(quoteToken);
  if (!quote) notFound();

  const open = quote.status === "sent";
  const notice = outcome ? OUTCOME_MESSAGES[outcome] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <BrandMark />
        <p className="text-micro font-semibold uppercase tracking-[0.12em] text-muted">Your roofing quote</p>
        <h1 className="text-headline font-bold tracking-[-0.02em]">{quote.businessName}</h1>
        <p className="flex items-start gap-1.5 text-body text-muted">
          <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{quote.propertyAddress}</span>
        </p>
      </header>

      {notice ? <FormMessage tone={notice.tone}>{notice.text}</FormMessage> : null}

      {quote.status === "accepted" ? (
        <Card tone="accent" className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-contrast">
            <CheckIcon className="h-6 w-6" />
          </span>
          <p className="text-title font-semibold">Accepted — thank you</p>
          <p className="max-w-xs text-caption text-muted">
            {quote.acceptedName} accepted this quote
            {quote.acceptedAt ? ` on ${formatNzDate(quote.acceptedAt)}` : ""}. {quote.businessName} will be in touch to
            book the work in.
          </p>
        </Card>
      ) : null}

      {quote.status === "declined" ? (
        <Card tone="quiet" className="py-8 text-center">
          <p className="text-title font-semibold">Thanks for letting us know</p>
          <p className="mt-1 text-caption text-muted">
            We&apos;ve closed this one off. If anything changes, just give {quote.businessName} a call.
          </p>
        </Card>
      ) : null}

      {quote.status === "superseded" ? (
        <Card tone="quiet" className="py-8 text-center">
          <p className="text-title font-semibold">This quote has been replaced</p>
          <p className="mt-1 text-caption text-muted">
            {quote.businessName} sent an updated one — check your messages for the new link.
          </p>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {quote.lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-medium">{line.description}</p>
                <p className="text-caption text-muted">
                  {formatQuantity(line.quantityThousandths)}
                  {line.kind === "per_m2" ? " m²" : line.kind === "per_metre" ? " m" : ""} × {formatNzd(line.unitPriceCents)}
                </p>
              </div>
              <span className="shrink-0 text-body tabular-nums">{formatNzd(line.lineTotalExGstCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex justify-between text-body">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatNzd(quote.subtotalExGstCents)}</dd>
          </div>
          <div className="flex justify-between text-body">
            <dt className="text-muted">GST</dt>
            <dd className="tabular-nums">{formatNzd(quote.gstCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-headline font-bold tracking-[-0.02em]">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatNzd(quote.totalIncGstCents)}</dd>
          </div>
        </dl>
        <p className="text-caption text-muted">Including GST. {quote.validUntil ? `Valid until ${formatNzDate(quote.validUntil)}.` : ""}</p>
      </Card>

      {quote.notes ? (
        <Card tone="quiet">
          <p className="text-body">{quote.notes}</p>
        </Card>
      ) : null}

      {quote.photoIds.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-caption font-semibold text-muted">Photos from the visit</h2>
          <ul className="grid grid-cols-2 gap-2">
            {quote.photoIds.map((photoId) => (
              <li key={photoId}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/quote-photos/${quoteToken}/${photoId}`}
                  alt="Photo of your roof taken during the visit"
                  className="aspect-square w-full rounded-field border border-border object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open ? (
        <>
          <Card className="flex flex-col gap-4">
            <form action={acceptQuoteAction} className="flex flex-col gap-4">
              <input type="hidden" name="quoteToken" value={quoteToken} />
              <Field
                label="Your full name"
                htmlFor="acceptedName"
                help="Typing your name here is how you accept this quote."
              >
                <TextInput
                  id="acceptedName"
                  name="acceptedName"
                  required
                  autoComplete="name"
                  defaultValue={quote.customerName}
                  placeholder="Your full name"
                />
              </Field>
              <Button type="submit" size="lg" block>
                Accept this quote
              </Button>
            </form>
          </Card>

          <details className="rounded-field border border-border px-4 py-3">
            <summary className="cursor-pointer text-caption font-semibold text-muted">
              Not going ahead?
            </summary>
            <form action={declineQuoteAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="quoteToken" value={quoteToken} />
              <Field label="Anything we could have done better?" hint="optional" htmlFor="declineReason">
                <TextArea id="declineReason" name="declineReason" rows={3} placeholder="Price, timing, went with someone else…" />
              </Field>
              <Button type="submit" variant="secondary" block>
                Let them know it&apos;s a no
              </Button>
            </form>
          </details>
        </>
      ) : null}

      <footer className="border-t border-border pt-4 text-center text-caption text-muted">
        <p>
          Quote provided by {quote.businessName}, sent using {PRODUCT_NAME}. Your details are only used to arrange this
          work — read our{" "}
          <Link href="/privacy" className="text-accent underline">
            privacy statement
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
