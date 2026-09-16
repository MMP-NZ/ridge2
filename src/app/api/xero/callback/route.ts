import { redirect } from "next/navigation";
import { withSystemTenantContext } from "@/db/client";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { getXeroClient } from "@/lib/xero/client";
import { saveTokens } from "@/lib/xero/connection";

/**
 * Where Xero sends the roofer back after he authorises Juno Logic's app.
 *
 * **Unexercised** — the app doesn't exist yet, so nothing has ever arrived
 * here from a real Xero. Written now so the shape is settled.
 *
 * The tenant is taken from the session and only cross-checked against
 * `state`; it is never taken *from* `state`, because that value comes back
 * through the browser and anyone could put another roofer's id in it.
 */
export async function GET(request: Request) {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (url.searchParams.get("error") || !code) {
    redirect("/more/xero?outcome=denied");
  }

  // A mismatch means this callback belongs to a different session — treat
  // it as an attempt to attach someone else's Xero to this account.
  if (state && state !== session.tenantId) {
    redirect("/more/xero?outcome=mismatch");
  }

  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!redirectUri) throw new Error("XERO_REDIRECT_URI is not set");

  const tokens = await getXeroClient().exchangeCode(code, redirectUri);
  await withSystemTenantContext(session.tenantId, (tx) => saveTokens(tx, session.tenantId, tokens));

  redirect("/more/xero?outcome=connected");
}
