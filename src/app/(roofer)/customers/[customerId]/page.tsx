import { notFound } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getCustomerDetail } from "@/lib/crm/queries";
import { formatNzDateTime } from "@/lib/time";
import { setConsentAction } from "../actions";

const SOURCE_LABELS: Record<string, string> = {
  juno_ads: "Juno ads",
  juno_website: "Website",
  juno_referral: "Referral",
  roofer_own: "Your own",
};

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  booked: "Booked",
  visited: "Visited",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

function describeEvent(event: { type: string; fromValue: string | null; toValue: string | null; actorType: string }): string {
  const actor = event.actorType === "system" ? "Website" : event.actorType === "staff" ? "Juno Logic" : "You";
  if (event.type === "created") {
    return `${actor} added this lead (source: ${SOURCE_LABELS[event.toValue ?? ""] ?? event.toValue})`;
  }
  if (event.type === "stage_changed") {
    return `${actor} moved this lead: ${STAGE_LABELS[event.fromValue ?? ""] ?? event.fromValue} → ${STAGE_LABELS[event.toValue ?? ""] ?? event.toValue}`;
  }
  if (event.type === "source_changed") {
    return `${actor} corrected the source: ${SOURCE_LABELS[event.fromValue ?? ""] ?? event.fromValue} → ${SOURCE_LABELS[event.toValue ?? ""] ?? event.toValue}`;
  }
  return event.type;
}

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { customerId } = await params;
  const detail = await getCustomerDetail(session.tenantId, customerId);
  if (!detail) notFound();

  const { customer, properties, events } = detail;

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        <p className="text-sm text-muted">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">Properties</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
          {properties.map((property) => (
            <li key={property.id}>{property.address}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <form action={setConsentAction} className="flex flex-col gap-3">
          <input type="hidden" name="customerId" value={customer.id} />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Marketing messages</p>
              <p className="text-xs text-muted">Review requests and promotions. Booking and invoice messages always go out.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="commercialConsent" defaultChecked={customer.commercialConsent} />
              Consented
            </label>
          </div>
          <button type="submit" className="self-start rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
            Save
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p>{describeEvent(event)}</p>
                <p className="mt-0.5 text-xs text-muted">{formatNzDateTime(event.occurredAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
