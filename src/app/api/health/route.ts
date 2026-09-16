import { pingAppDb } from "@/db/client";
import { photoStoreProblem } from "@/lib/photos/store";

/**
 * Render's health check. The host only switches traffic to a new deploy once
 * this returns 200.
 *
 * It checks the things that would otherwise fail quietly after go-live. The
 * database check runs as ridge_app, because a wrong role password would still
 * pass a plain "ok" and then fail every roofer's first request. The photo
 * check catches photos going to a disk that is wiped or can't be written to.
 *
 * Details stay in the server log and aren't sent to the caller, because the
 * route is public.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pingAppDb();
  } catch (err) {
    console.error("Health check failed: database", err);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  const photoProblem = await photoStoreProblem();
  if (photoProblem) {
    console.error(`Health check failed: ${photoProblem}`);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  return Response.json({ status: "ok" });
}
