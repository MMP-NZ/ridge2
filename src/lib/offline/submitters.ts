import { saveCaptureAction, uploadVisitPhotoAction } from "@/app/(roofer)/visits/[visitId]/capture/actions";
import type { CapturedVisit, PendingPhoto } from "./outbox-types";

/**
 * Sends a queued item using the very same server actions the online form
 * calls. Deliberately not a separate API: a capture that syncs later must
 * take exactly the path a capture typed with reception takes, or the two
 * drift and only one of them stays tested.
 *
 * These throw on failure so flushOutbox keeps the item queued. The
 * realistic failure is the network; a validation failure can't normally
 * happen here because the form validated before queueing, and if one ever
 * did the attempts counter on the entry is what makes it visible.
 */
export async function submitQueuedCapture(payload: CapturedVisit): Promise<void> {
  const data = new FormData();
  data.set("visitId", payload.visitId);
  data.set("clientCaptureId", payload.clientCaptureId);
  data.set("capturedAt", payload.capturedAt);
  data.set("roofType", payload.roofType ?? "");
  data.set("material", payload.material ?? "");
  data.set("areaM2", payload.areaM2 === undefined ? "" : String(payload.areaM2));
  data.set("pitchDegrees", payload.pitchDegrees === undefined ? "" : String(payload.pitchDegrees));
  if (payload.condition) data.set("condition", payload.condition);
  data.set("siteNotes", payload.siteNotes ?? "");

  const result = await saveCaptureAction({}, data);
  if (result.error) throw new Error(result.error);
}

export async function submitQueuedPhoto(payload: PendingPhoto): Promise<void> {
  const data = new FormData();
  data.set("visitId", payload.visitId);
  data.set("clientPhotoId", payload.clientPhotoId);
  if (payload.caption) data.set("caption", payload.caption);
  data.set("photo", new File([payload.bytes], `${payload.clientPhotoId}.jpg`, { type: payload.contentType }));

  await uploadVisitPhotoAction(data);
}
