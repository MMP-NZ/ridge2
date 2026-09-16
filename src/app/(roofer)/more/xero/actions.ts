"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentRooferSession } from "@/lib/auth/current-session";
import { withRooferAccess } from "@/lib/auth/with-tenant-context";
import { getXeroClient } from "@/lib/xero/client";
import { saveTokens, disconnect } from "@/lib/xero/connection";

/**
 * Starts the Xero connection.
 *
 * With FAKE_XERO on — which is the default, and the only mode until Juno
 * Logic's Xero app exists — there's no real authorisation to send him to,
 * so the fake hands back tokens immediately and the roofer sees the
 * connected state. Once the app exists this redirects to Xero instead and
 * the callback route completes it.
 */
export async function connectXeroAction(): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  if (process.env.FAKE_XERO !== "false") {
    const tokens = await getXeroClient().exchangeCode("fake-code", "fake-redirect");
    await withRooferAccess(session.tenantId, (tx) => saveTokens(tx, session.tenantId, tokens));
    revalidatePath("/more/xero");
    return;
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error("XERO_CLIENT_ID / XERO_REDIRECT_URI are not set");

  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile email accounting.transactions accounting.contacts offline_access");
  // The tenant id is round-tripped so the callback knows whose connection
  // this is — it arrives without a session cookie in some browsers.
  url.searchParams.set("state", session.tenantId);

  redirect(url.toString());
}

export async function disconnectXeroAction(): Promise<void> {
  const session = await getCurrentRooferSession();
  if (!session) redirect("/login");

  await withRooferAccess(session.tenantId, (tx) => disconnect(tx, session.tenantId));

  revalidatePath("/more/xero");
}
