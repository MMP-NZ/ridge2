import { eq } from "drizzle-orm";
import { withRooferTenantContext } from "@/db/client";
import { metaConnections } from "@/db/schema";
import { encryptSecret } from "@/lib/auth/encryption";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedToken,
  listManagedPages,
  subscribePageToLeadgenWebhook,
} from "./graph";

export type CompleteConnectionResult = { connected: true } | { connected: false; reason: "no_pages" };

/**
 * Orchestrates the OAuth callback: exchange the code for a long-lived user
 * token (calling /me/accounts with a *long-lived* user token is what makes
 * Meta return long-lived Page tokens directly — no separate page-token
 * exchange step needed), store the first Page found (a page-picker UI for
 * roofers managing multiple Pages is deferred — most solo operators manage
 * one), and subscribe it to the leadgen webhook field.
 *
 * Untestable end-to-end without a real META_APP_ID/META_APP_SECRET and a
 * live Meta App — see docs/decisions.md.
 */
export async function completeMetaConnection(
  tenantId: string,
  code: string,
  redirectUri: string,
): Promise<CompleteConnectionResult> {
  const shortLivedUserToken = await exchangeCodeForUserToken(code, redirectUri);
  const longLivedUserToken = await exchangeForLongLivedToken(shortLivedUserToken);
  const pages = await listManagedPages(longLivedUserToken);

  if (pages.length === 0) return { connected: false, reason: "no_pages" };
  const page = pages[0];

  await withRooferTenantContext(tenantId, (tx) =>
    tx
      .insert(metaConnections)
      .values({
        tenantId,
        pageId: page.id,
        pageName: page.name,
        accessTokenEncrypted: encryptSecret(page.access_token),
      })
      .onConflictDoUpdate({
        target: metaConnections.tenantId,
        set: {
          pageId: page.id,
          pageName: page.name,
          accessTokenEncrypted: encryptSecret(page.access_token),
          connectedAt: new Date(),
          webhookSubscribedAt: null,
        },
      }),
  );

  await subscribePageToLeadgenWebhook(page.id, page.access_token);

  await withRooferTenantContext(tenantId, (tx) =>
    tx.update(metaConnections).set({ webhookSubscribedAt: new Date() }).where(eq(metaConnections.tenantId, tenantId)),
  );

  return { connected: true };
}
