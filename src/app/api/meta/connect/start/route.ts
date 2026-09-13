import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { oauthDialogUrl } from "@/lib/meta/graph";
import { generateToken } from "@/lib/tokens";
import { META_OAUTH_STATE_COOKIE, metaConnectRedirectUri } from "@/lib/meta/oauth-state";

/** Kicks off Facebook Login for Business. Untestable without a real META_APP_ID — see docs/decisions.md. */
export async function GET() {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  const state = generateToken(16);
  const dialogUrl = oauthDialogUrl(metaConnectRedirectUri(), state);

  const response = NextResponse.redirect(dialogUrl);
  response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
