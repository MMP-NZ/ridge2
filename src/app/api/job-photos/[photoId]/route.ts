import { and, eq } from "drizzle-orm";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { jobPhotos } from "@/db/schema";
import { getPhotoStore } from "@/lib/photos/store";

/**
 * Serves a completion photo to the roofer who owns it. Same shape as
 * /api/photos for visit photos: private bucket, session required, and the
 * tenant-scoped policy returns nothing at all for another roofer's id.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const session = await getCurrentRooferSession();
  if (!session) return new Response("Not found", { status: 404 });

  const { photoId } = await params;

  const [photo] = await withRooferAccess(session.tenantId, (tx) =>
    tx
      .select()
      .from(jobPhotos)
      .where(and(eq(jobPhotos.tenantId, session.tenantId), eq(jobPhotos.id, photoId))),
  );
  if (!photo) return new Response("Not found", { status: 404 });

  const stored = await getPhotoStore().get(photo.storageKey);
  if (!stored) return new Response("Not found", { status: 404 });

  return new Response(stored.bytes as BodyInit, {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
