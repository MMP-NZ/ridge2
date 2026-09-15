import { and, asc, eq } from "drizzle-orm";
import { visitPhotos, visits, type VisitPhoto } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { getPhotoStore } from "@/lib/photos/store";
import { photoStorageKey } from "@/lib/photos/types";

export interface AddPhotoInput {
  clientPhotoId: string;
  bytes: Uint8Array;
  contentType: string;
  caption?: string;
}

/**
 * Stores one site photo, returning null if it was already uploaded.
 *
 * Safe to repeat: a photo queued offline gets retried when the connection
 * drops mid-send. The check below handles that ordinary case, and
 * UNIQUE(tenant_id, client_photo_id) is the backstop for two genuinely
 * simultaneous uploads.
 *
 * That backstop cannot be caught in here. postgres.js rolls the whole
 * transaction back and rethrows when any statement fails, so a try/catch
 * around the insert would swallow the error but still lose the
 * transaction — the same reason bookVisit (M2) catches isUniqueViolation
 * outside withSystemTenantContext rather than inside it. Callers do the
 * same; see uploadVisitPhotoAction.
 *
 * Bytes are written before the row. Writing the row first would risk a
 * record pointing at a key holding nothing; this way the worst case is an
 * orphaned object, which a bucket lifecycle rule sweeps and which nothing
 * in the app ever shows.
 */
export async function addVisitPhoto(
  tx: AppTx,
  tenantId: string,
  visitId: string,
  input: AddPhotoInput,
): Promise<VisitPhoto | null> {
  const [visit] = await tx
    .select({ id: visits.id })
    .from(visits)
    .where(and(eq(visits.tenantId, tenantId), eq(visits.id, visitId)));
  if (!visit) throw new Error("Visit not found");

  const [already] = await tx
    .select({ id: visitPhotos.id })
    .from(visitPhotos)
    .where(and(eq(visitPhotos.tenantId, tenantId), eq(visitPhotos.clientPhotoId, input.clientPhotoId)));
  if (already) return null;

  const key = photoStorageKey(tenantId, visitId, input.clientPhotoId);
  const stored = await getPhotoStore().put(key, input.bytes, input.contentType);

  const [row] = await tx
    .insert(visitPhotos)
    .values({
      tenantId,
      visitId,
      clientPhotoId: input.clientPhotoId,
      storageKey: stored.storageKey,
      contentType: input.contentType,
      byteSize: stored.byteSize,
      caption: input.caption,
    })
    .returning();
  return row;
}

export async function listVisitPhotos(tx: AppTx, tenantId: string, visitId: string): Promise<VisitPhoto[]> {
  return tx
    .select()
    .from(visitPhotos)
    .where(and(eq(visitPhotos.tenantId, tenantId), eq(visitPhotos.visitId, visitId)))
    .orderBy(asc(visitPhotos.createdAt));
}

export async function setPhotoIncludedInQuote(
  tx: AppTx,
  tenantId: string,
  photoId: string,
  includeInQuote: boolean,
): Promise<void> {
  await tx
    .update(visitPhotos)
    .set({ includeInQuote })
    .where(and(eq(visitPhotos.tenantId, tenantId), eq(visitPhotos.id, photoId)));
}
