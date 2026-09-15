"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { isUniqueViolation } from "@/db/errors";
import { captureVisit } from "@/lib/visits/capture";
import { addVisitPhoto } from "@/lib/visits/photos";
import { parseQuantityToThousandths } from "@/lib/quotes/parse";

export interface CaptureState {
  error?: string;
  savedAt?: string;
}

const CONDITIONS = ["good", "fair", "poor", "urgent"] as const;

function optionalNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const thousandths = parseQuantityToThousandths(trimmed);
  return thousandths === null ? null : thousandths / 1000;
}

export async function saveCaptureAction(_prev: CaptureState, formData: FormData): Promise<CaptureState> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const visitId = String(formData.get("visitId") ?? "");
  const clientCaptureId = String(formData.get("clientCaptureId") ?? "");
  if (!visitId || !clientCaptureId) return { error: "Something went wrong — reload and try again." };

  const area = optionalNumber(String(formData.get("areaM2") ?? ""));
  const pitch = optionalNumber(String(formData.get("pitchDegrees") ?? ""));
  if (area === null) return { error: "Enter the roof area as a number, like 148.5." };
  if (pitch === null) return { error: "Enter the pitch as a number, like 25." };

  const conditionRaw = String(formData.get("condition") ?? "");
  const condition = (CONDITIONS as readonly string[]).includes(conditionRaw)
    ? (conditionRaw as (typeof CONDITIONS)[number])
    : undefined;

  const capturedAtRaw = String(formData.get("capturedAt") ?? "");
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : undefined;

  await withRooferAccess(session.tenantId, (tx) =>
    captureVisit(
      tx,
      session.tenantId,
      visitId,
      {
        clientCaptureId,
        capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : undefined,
        roofType: String(formData.get("roofType") ?? "").trim() || undefined,
        material: String(formData.get("material") ?? "").trim() || undefined,
        pitchDegrees: pitch,
        areaM2: area,
        condition,
        siteNotes: String(formData.get("siteNotes") ?? "").trim() || undefined,
      },
      { type: "roofer", id: session.rooferUserId },
    ),
  );

  revalidatePath(`/visits/${visitId}/capture`);
  revalidatePath("/today");
  revalidatePath("/leads");
  return { savedAt: new Date().toISOString() };
}

/**
 * One photo per call, so a flaky connection retries a single image rather
 * than the whole set (see src/lib/offline/flush.ts).
 */
export async function uploadVisitPhotoAction(formData: FormData): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const visitId = String(formData.get("visitId") ?? "");
  const clientPhotoId = String(formData.get("clientPhotoId") ?? "");
  const file = formData.get("photo");

  if (!visitId || !clientPhotoId || !(file instanceof File) || file.size === 0) return;

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await withRooferAccess(session.tenantId, (tx) =>
      addVisitPhoto(tx, session.tenantId, visitId, {
        clientPhotoId,
        bytes,
        contentType: file.type || "image/jpeg",
        caption: String(formData.get("caption") ?? "").trim() || undefined,
      }),
    );
  } catch (err) {
    // Two uploads of the same photo landing at once. The constraint has to
    // be caught out here: postgres.js rolls the transaction back and
    // rethrows, so addVisitPhoto can't swallow it from inside (same shape
    // as bookVisit in M2). Either way the photo is stored — nothing to
    // tell the roofer about.
    if (!isUniqueViolation(err)) throw err;
  }

  revalidatePath(`/visits/${visitId}/capture`);
}
