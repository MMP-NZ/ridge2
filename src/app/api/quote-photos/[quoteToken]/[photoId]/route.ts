import { and, eq } from "drizzle-orm";
import { withSystemTenantContext } from "@/db/client";
import { visitPhotos } from "@/db/schema";
import { getQuotePageData } from "@/lib/quotes/public-lookup";
import { getPhotoStore } from "@/lib/photos/store";

/**
 * Serves a site photo to the customer looking at their quote.
 *
 * The roofer-facing /api/photos route requires a session; this one is
 * reached by a customer who will never have one. The quote token is the
 * credential, and the photo must belong to that quote's own visit *and* be
 * ticked for the customer to see — so one token can't be used to fish for
 * another job's photos, and nothing the roofer kept back is exposed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ quoteToken: string; photoId: string }> },
) {
  const { quoteToken, photoId } = await params;

  const page = await getQuotePageData(quoteToken);
  if (!page || !page.photoIds.includes(photoId)) return new Response("Not found", { status: 404 });

  const photo = await withSystemTenantContext(page.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(visitPhotos)
      .where(and(eq(visitPhotos.tenantId, page.tenantId), eq(visitPhotos.id, photoId)));
    return row;
  });
  if (!photo) return new Response("Not found", { status: 404 });

  const stored = await getPhotoStore().get(photo.storageKey);
  if (!stored) return new Response("Not found", { status: 404 });

  return new Response(stored.bytes as BodyInit, {
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.bytes.byteLength),
      // Private: these are pictures of the customer's own house.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
