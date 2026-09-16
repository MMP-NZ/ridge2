import { and, eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { visitPhotos } from "@/db/schema";
import { getPhotoStore } from "@/lib/photos/store";

/**
 * Serves a site photo to the roofer who owns it. These are pictures of
 * customers' houses, so the bucket is private and every read goes through
 * a session and the tenant-scoped policy — the lookup below returns
 * nothing at all for another roofer's photo id.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const session = await getCurrentRooferSession();
  if (!session) return new Response("Not found", { status: 404 });

  const { photoId } = await params;

  const [photo] = await withRooferAccess(session.tenantId, (tx) =>
    tx
      .select()
      .from(visitPhotos)
      .where(and(eq(visitPhotos.tenantId, session.tenantId), eq(visitPhotos.id, photoId))),
  );
  if (!photo) return new Response("Not found", { status: 404 });

  const stored = await getPhotoStore().get(photo.storageKey);
  if (!stored) return new Response("Not found", { status: 404 });

  return new Response(stored.bytes as BodyInit, {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.bytes.byteLength),
      // Private: a shared cache must never hold one roofer's customer photos.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
