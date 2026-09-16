import { notFound } from "next/navigation";
import { getBookingPageData } from "@/lib/booking/public-lookup";
import { formatNzDate } from "@/lib/time";
import { PRODUCT_NAME } from "@/lib/config";
import { BrandMark } from "@/components/brand-mark";
import { CheckIcon, ClockIcon, PinIcon } from "@/components/icons";
import {
  Card,
  EmptyState,
  FormMessage,
  formatNzTime,
  formatNzWeekdayDate,
} from "@/components/ui";
import { submitBookingAction } from "./actions";

const OUTCOME_MESSAGES: Record<
  string,
  { tone: "success" | "error"; text: string }
> = {
  booked: {
    tone: "success",
    text: "You're booked in — we've sent a confirmation.",
  },
  taken: {
    tone: "error",
    text: "Sorry, someone else just took that time. Pick another below.",
  },
  unavailable: {
    tone: "error",
    text: "That time's no longer available. Pick another below.",
  },
};

const REASSURANCES = [
  "Free, with no obligation",
  "Takes about 45 minutes on site",
  "A written quote follows by email",
];

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingToken: string }>;
  searchParams: Promise<{ outcome?: string }>;
}) {
  const { bookingToken } = await params;
  const { outcome } = await searchParams;

  const data = await getBookingPageData(bookingToken);
  if (!data) notFound();

  const alreadyHandled = data.stage !== "new";
  const groupedByDay = new Map<string, Date[]>();
  for (const slot of data.slots) {
    const key = formatNzDate(slot);
    if (!groupedByDay.has(key)) groupedByDay.set(key, []);
    groupedByDay.get(key)!.push(slot);
  }

  const outcomeMessage = outcome ? OUTCOME_MESSAGES[outcome] : undefined;
  const showSlots =
    !alreadyHandled &&
    data.configured &&
    !data.declined &&
    data.slots.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <BrandMark size={52} />
        <div className="flex flex-col gap-1.5">
          <p className="text-micro font-semibold uppercase tracking-[0.11em] text-muted">
            Free roof check
          </p>
          <h1 className="text-display font-semibold tracking-[-0.025em] text-balance">
            {data.businessName}
          </h1>
          <p className="text-body text-muted text-pretty">
            Pick a time that suits and we&apos;ll come and take a look at your
            roof.
          </p>
        </div>
      </header>

      {showSlots ? (
        <ul className="mt-6 flex flex-col gap-2">
          {REASSURANCES.map((line) => (
            <li key={line} className="flex items-center gap-2.5 text-body">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-accent text-accent-contrast">
                <CheckIcon className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="min-w-0 text-muted">{line}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {outcomeMessage ? (
        <div className="mt-6">
          <FormMessage tone={outcomeMessage.tone}>
            {outcomeMessage.text}
          </FormMessage>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        {alreadyHandled ? (
          <EmptyState
            icon={<CheckIcon className="h-6 w-6" strokeWidth={2.25} />}
            title="You're all sorted"
            description="This has already been booked — there's nothing else you need to do."
          />
        ) : !data.configured ? (
          <EmptyState
            icon={<ClockIcon className="h-6 w-6" />}
            title="Online booking isn't open yet"
            description={`${data.businessName} will be in touch shortly to arrange a time.`}
          />
        ) : data.declined ? (
          <EmptyState
            icon={<PinIcon className="h-6 w-6" />}
            title="Just outside our usual patch"
            description={`${data.propertyAddress} is outside the area we normally cover — we'll be in touch about your options.`}
          />
        ) : data.slots.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="h-6 w-6" />}
            title="No times open right now"
            description={`${data.businessName} will be in touch to arrange a time that works.`}
          />
        ) : (
          <>
            <Card tone="accent" className="flex items-start gap-2.5">
              <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                  Visiting
                </p>
                <p className="text-body font-semibold">
                  {data.propertyAddress}
                </p>
              </div>
            </Card>

            {[...groupedByDay.entries()].map(([day, slots]) => (
              <section key={day} className="flex flex-col gap-2.5">
                <h2 className="text-title font-semibold tracking-[-0.01em]">
                  {formatNzWeekdayDate(slots[0])}
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {slots.map((slot) => (
                    <form key={slot.toISOString()} action={submitBookingAction}>
                      <input
                        type="hidden"
                        name="bookingToken"
                        value={bookingToken}
                      />
                      <input
                        type="hidden"
                        name="startAt"
                        value={slot.toISOString()}
                      />
                      <button
                        type="submit"
                        className="flex min-h-14 w-full items-center justify-center rounded-field border border-border-strong bg-surface px-3 text-title font-semibold tabular-nums tracking-[-0.01em] shadow-card transition-[background-color,border-color,color,transform,box-shadow] duration-150 hover:border-accent hover:bg-accent-soft active:scale-[0.98] active:bg-accent active:text-accent-contrast active:shadow-none"
                      >
                        {formatNzTime(slot)}
                      </button>
                    </form>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <footer className="mt-10 border-t border-border pt-5 text-center">
        <p className="text-caption text-muted text-pretty">
          Booking handled for {data.businessName} by {PRODUCT_NAME}. Your
          details are only used to arrange this visit — read our{" "}
          <a
            href="/privacy"
            className="font-medium text-accent underline underline-offset-2"
          >
            privacy statement
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
