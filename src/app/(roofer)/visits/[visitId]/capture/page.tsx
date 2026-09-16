import { notFound } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getVisitDetail } from "@/lib/visits/queries";
import { mapsSearchUrl } from "@/lib/booking/queries";
import { ClockIcon, PinIcon } from "@/components/icons";
import {
  Badge,
  Card,
  LinkButton,
  PageHeader,
  Screen,
  formatNzDayLabel,
  formatNzTime,
} from "@/components/ui";
import { CaptureForm } from "./capture-form";

export default async function VisitCapturePage({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  const session = await getCurrentRooferSession();
  if (!session) return null; // layout already redirects

  const { visitId } = await params;
  const detail = await getVisitDetail(session.tenantId, visitId);
  if (!detail) notFound();

  const captured = detail.visit.capturedAt !== null;

  return (
    <Screen>
      <PageHeader
        backHref="/today"
        backLabel="Today"
        eyebrow="Site visit"
        title={detail.customerName}
        action={
          captured ? <Badge tone="accent-soft">Written up</Badge> : undefined
        }
      />

      <Card className="flex flex-col gap-2.5">
        <a
          href={mapsSearchUrl(detail.propertyAddress)}
          className="flex items-start gap-2 text-body font-semibold text-accent underline decoration-accent/35 underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">{detail.propertyAddress}</span>
        </a>
        <p className="flex items-center gap-2 text-caption text-muted">
          <ClockIcon className="h-4 w-4 shrink-0" />
          {formatNzDayLabel(detail.visit.startAt)} ·{" "}
          {formatNzTime(detail.visit.startAt)}
        </p>
      </Card>

      <CaptureForm
        visitId={detail.visit.id}
        alreadyCaptured={captured}
        initial={{
          roofType: detail.visit.roofType ?? "",
          material: detail.visit.material ?? "",
          pitchDegrees: detail.visit.pitchDegrees,
          areaM2: detail.visit.areaM2,
          condition: detail.visit.condition,
          siteNotes: detail.visit.siteNotes ?? "",
        }}
        photos={detail.photos.map((p) => ({ id: p.id, caption: p.caption }))}
      />

      {captured ? (
        <LinkButton
          href={`/quotes/new?visitId=${detail.visit.id}`}
          size="lg"
          block
        >
          Build the quote
        </LinkButton>
      ) : null}
    </Screen>
  );
}
