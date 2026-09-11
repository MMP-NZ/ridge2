import { notFound } from "next/navigation";
import { getBookingPageData } from "@/lib/booking/public-lookup";
import { formatNzDate, formatNzDateTime } from "@/lib/time";
import { PRODUCT_NAME } from "@/lib/config";
import { submitBookingAction } from "./actions";

const OUTCOME_MESSAGES: Record<string, string> = {
  booked: "You're booked in — we've sent a confirmation.",
  taken: "Sorry, someone else just took that time. Pick another below.",
  unavailable: "That time's no longer available. Pick another below.",
};

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

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{data.businessName}</h1>
        <p className="text-sm text-muted">Book a free roof check — via {PRODUCT_NAME}</p>
      </div>

      {outcome && OUTCOME_MESSAGES[outcome] ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">{OUTCOME_MESSAGES[outcome]}</div>
      ) : null}

      {alreadyHandled ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          <p>This has already been booked — no need to do anything else.</p>
        </div>
      ) : !data.configured ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          <p>Online booking isn&apos;t switched on yet — we&apos;ll be in touch to arrange a time.</p>
        </div>
      ) : data.declined ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          <p>{data.propertyAddress} is outside our usual service area — we&apos;ll be in touch about your options.</p>
        </div>
      ) : data.slots.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-muted">
          <p>No quote days are open right now — we&apos;ll be in touch to arrange a time.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{data.propertyAddress}</p>
          {[...groupedByDay.entries()].map(([day, slots]) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-medium">{day}</h2>
              <div className="flex flex-col gap-2">
                {slots.map((slot) => (
                  <form key={slot.toISOString()} action={submitBookingAction}>
                    <input type="hidden" name="bookingToken" value={bookingToken} />
                    <input type="hidden" name="startAt" value={slot.toISOString()} />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm"
                    >
                      {formatNzDateTime(slot)}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        {data.businessName} and {PRODUCT_NAME} keep your details private — see our{" "}
        <a href="/privacy" className="underline">
          privacy statement
        </a>
        .
      </p>
    </main>
  );
}
