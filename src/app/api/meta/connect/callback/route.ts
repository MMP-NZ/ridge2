import { NextRequest, NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { completeMetaConnection } from "@/lib/meta/connect";
import { META_OAUTH_STATE_COOKIE, metaConnectRedirectUri } from "@/lib/meta/oauth-state";

function adsPageUrl(request: NextRequest, outcome: string): URL {
  return new URL(`/more/ads?metaConnect=${outcome}`, request.url);
}

/** OAuth callback. Untestable without a real Meta App — see docs/decisions.md. */
export async function GET(request: NextRequest) {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(META_OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(META_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(adsPageUrl(request, "error"));
  }

  try {
    const result = await completeMetaConnection(session.tenantId, code, metaConnectRedirectUri());
    return NextResponse.redirect(adsPageUrl(request, result.connected ? "connected" : result.reason));
  } catch (err) {
    console.error("Meta connect callback failed:", err);
    return NextResponse.redirect(adsPageUrl(request, "error"));
  }
}
