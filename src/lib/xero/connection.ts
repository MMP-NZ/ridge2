import { and, eq } from "drizzle-orm";
import { xeroConnections, type XeroConnection } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { encryptSecret, decryptSecret } from "@/lib/auth/encryption";
import { getXeroClient } from "./client";
import { XeroAuthError, type XeroTokens } from "./types";

/** A minute's grace, so a token doesn't expire mid-request. */
const REFRESH_MARGIN_MS = 60 * 1000;

export async function getConnection(tx: AppTx, tenantId: string): Promise<XeroConnection | null> {
  const [row] = await tx.select().from(xeroConnections).where(eq(xeroConnections.tenantId, tenantId));
  return row ?? null;
}

export async function saveTokens(tx: AppTx, tenantId: string, tokens: XeroTokens): Promise<XeroConnection> {
  const values = {
    tenantId,
    xeroTenantId: tokens.xeroTenantId,
    organisationName: tokens.organisationName,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    // Any successful token exchange clears the reconnect flag — that's what
    // reconnecting *means*.
    needsReconnectAt: null,
  };

  const [row] = await tx
    .insert(xeroConnections)
    .values(values)
    .onConflictDoUpdate({ target: xeroConnections.tenantId, set: values })
    .returning();
  return row;
}

export async function markNeedsReconnect(tx: AppTx, tenantId: string): Promise<void> {
  await tx
    .update(xeroConnections)
    .set({ needsReconnectAt: new Date() })
    .where(and(eq(xeroConnections.tenantId, tenantId), eq(xeroConnections.tenantId, tenantId)));
}

export async function disconnect(tx: AppTx, tenantId: string): Promise<void> {
  await tx.delete(xeroConnections).where(eq(xeroConnections.tenantId, tenantId));
}

export type UsableTokens = { status: "ok"; tokens: XeroTokens } | { status: "needs_reconnect" } | { status: "not_connected" };

/**
 * Returns tokens good for a call right now, refreshing first if they're
 * close to expiring.
 *
 * The rotation is the part that bites: Xero issues a **new refresh token
 * on every refresh** and invalidates the old one, so the new pair must be
 * persisted before it's used. If we ever refresh and fail to save, the
 * connection is dead and only the roofer can fix it.
 *
 * A failed refresh is not an error to throw at a caller — it's a state the
 * roofer has to resolve — so it comes back as `needs_reconnect` and the
 * connection is flagged. Callers stop what they're doing and leave the work
 * pending rather than losing it.
 */
export async function getUsableTokens(tx: AppTx, tenantId: string): Promise<UsableTokens> {
  const connection = await getConnection(tx, tenantId);
  if (!connection) return { status: "not_connected" };
  if (connection.needsReconnectAt) return { status: "needs_reconnect" };

  const current: XeroTokens = {
    accessToken: decryptSecret(connection.accessTokenEncrypted),
    refreshToken: decryptSecret(connection.refreshTokenEncrypted),
    expiresAt: connection.expiresAt,
    xeroTenantId: connection.xeroTenantId,
    organisationName: connection.organisationName ?? undefined,
  };

  if (current.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
    return { status: "ok", tokens: current };
  }

  try {
    const refreshed = await getXeroClient().refresh(current.refreshToken);
    await saveTokens(tx, tenantId, refreshed);
    return { status: "ok", tokens: refreshed };
  } catch (err) {
    if (err instanceof XeroAuthError) {
      await markNeedsReconnect(tx, tenantId);
      return { status: "needs_reconnect" };
    }
    // A network blip is not a broken connection — don't make the roofer
    // reconnect over someone else's outage.
    throw err;
  }
}
