import { notFound } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getCustomerDetail } from "@/lib/crm/queries";
import { formatNzDateTime } from "@/lib/time";
import { PhoneIcon, PinIcon } from "@/components/icons";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  Screen,
  SectionHeading,
  PageHeader,
  ToggleRow,
} from "@/components/ui";
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

function describeEvent(event: {
  type: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
}): string {
  const actor =
    event.actorType === "system"
      ? "Website"
      : event.actorType === "staff"
        ? "Juno Logic"
        : "You";
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

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { customerId } = await params;
  const detail = await getCustomerDetail(session.tenantId, customerId);
  if (!detail) notFound();

  const { customer, properties, events } = detail;

  return (
    <Screen>
      <PageHeader
        backHref="/leads"
        backLabel="Leads"
        title={customer.name}
        eyebrow="Customer"
      />

      <Card padding="none" className="divide-y divide-border">
        {customer.phone ? (
          <a
            href={`tel:${customer.phone.replace(/\s+/g, "")}`}
            className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors active:bg-surface-sunken"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent-soft text-accent">
              <PhoneIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-body font-semibold text-accent">
              {customer.phone}
            </span>
          </a>
        ) : null}
        {customer.email ? (
          <a
            href={`mailto:${customer.email}`}
            className="flex min-h-14 items-center gap-3 px-4 py-3 text-body transition-colors active:bg-surface-sunken"
          >
            <span className="w-9 shrink-0 text-center text-caption font-semibold text-muted">
              @
            </span>
            <span className="min-w-0 truncate font-medium text-accent">
              {customer.email}
            </span>
          </a>
        ) : null}
        {!customer.phone && !customer.email ? (
          <p className="px-4 py-3 text-body text-muted">
            No contact details on file.
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle>Properties</CardTitle>
        <ul className="flex flex-col gap-1.5">
          {properties.map((property) => (
            <li
              key={property.id}
              className="flex items-start gap-1.5 text-body text-muted"
            >
              <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{property.address}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <form action={setConsentAction} className="flex flex-col gap-3">
          <input type="hidden" name="customerId" value={customer.id} />
          <ToggleRow
            name="commercialConsent"
            defaultChecked={customer.commercialConsent}
            title="Marketing messages"
            description="Review requests and promotions. Booking and invoice messages always go out."
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="self-start"
          >
            Save
          </Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionHeading>Timeline</SectionHeading>
        {events.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Every move on this lead gets recorded here."
          />
        ) : (
          <ol className="flex flex-col gap-2.5">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-pill bg-accent"
                />
                <Card padding="sm" className="min-w-0 flex-1">
                  <p className="text-body text-pretty">
                    {describeEvent(event)}
                  </p>
                  <p className="mt-0.5 text-caption text-muted">
                    {formatNzDateTime(event.occurredAt)}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Screen>
  );
}
