import { eq } from "drizzle-orm";
import { platformXeroConnection, type PlatformInvoice, type Tenant } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { encryptSecret, decryptSecret } from "@/lib/auth/encryption";
import { getXeroClient } from "@/lib/xero/client";
import { XeroAuthError, type XeroTokens } from "@/lib/xero/types";
import { formatNzDate } from "@/lib/time";

/**
 * Juno Logic's **own** Xero, where invoices to roofers are raised.
 *
 * Separate from src/lib/xero/connection.ts, which manages each roofer's
 * connection to his own accounts. Keeping the two apart matters: one holds
 * a customer's credentials, the other holds Juno Logic's, and they must
 * never be reachable through the same code path by accident.
 */
const REFRESH_MARGIN_MS = 60 * 1000;
const SINGLETON = "only";

export async function getPlatformConnection(tx: AppTx) {
  const [row] = await tx.select().from(platformXeroConnection).where(eq(platformXeroConnection.singleton, SINGLETON));
  return row ?? null;
}

export async function savePlatformTokens(tx: AppTx, tokens: XeroTokens): Promise<void> {
  const values = {
    singleton: SINGLETON,
    xeroTenantId: tokens.xeroTenantId,
    organisationName: tokens.organisationName,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    needsReconnectAt: null,
  };

  await tx
    .insert(platformXeroConnection)
    .values(values)
    .onConflictDoUpdate({ target: platformXeroConnection.singleton, set: values });
}

export type PlatformTokens =
  | { status: "ok"; tokens: XeroTokens }
  | { status: "needs_reconnect" }
  | { status: "not_connected" };

export async function getPlatformTokens(tx: AppTx): Promise<PlatformTokens> {
  const connection = await getPlatformConnection(tx);
  if (!connection) return { status: "not_connected" };
  if (connection.needsReconnectAt) return { status: "needs_reconnect" };

  const current: XeroTokens = {
    accessToken: decryptSecret(connection.accessTokenEncrypted),
    refreshToken: decryptSecret(connection.refreshTokenEncrypted),
    expiresAt: connection.expiresAt,
    xeroTenantId: connection.xeroTenantId,
    organisationName: connection.organisationName ?? undefined,
  };

  if (current.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) return { status: "ok", tokens: current };

  try {
    const refreshed = await getXeroClient().refresh(current.refreshToken);
    await savePlatformTokens(tx, refreshed);
    return { status: "ok", tokens: refreshed };
  } catch (err) {
    if (err instanceof XeroAuthError) {
      await tx
        .update(platformXeroConnection)
        .set({ needsReconnectAt: new Date() })
        .where(eq(platformXeroConnection.singleton, SINGLETON));
      return { status: "needs_reconnect" };
    }
    throw err;
  }
}

/**
 * Raises one roofer's monthly invoice in Juno Logic's Xero, as three lines.
 *
 * Three lines rather than one total, because that is the build plan's
 * done-when check and because a roofer opening the invoice should be able
 * to see which part is software, which is Juno Logic's share of work it won
 * him, and which is his own ad money passed through untouched.
 *
 * A zero line is dropped rather than shown at $0.00 — an invoice listing
 * "Commission $0.00" invites a question the roofer doesn't need to ask.
 */
export async function raisePlatformInvoice(
  tx: AppTx,
  tenant: Tenant,
  invoice: PlatformInvoice,
): Promise<{ xeroInvoiceId: string; invoiceNumber: string | null } | null> {
  const auth = await getPlatformTokens(tx);
  if (auth.status !== "ok") return null;

  const periodLabel = formatNzDate(new Date(`${invoice.periodMonth}T12:00:00Z`));

  const lines = [
    { description: `Platform fee — ${periodLabel}`, cents: invoice.planFeeCents },
    { description: `Commission on Juno-sourced work — ${periodLabel}`, cents: invoice.commissionCents },
    { description: `Advertising spend at cost — ${periodLabel}`, cents: invoice.adTopUpsCents },
  ].filter((line) => line.cents !== 0);

  const created = await getXeroClient().createDraftInvoice(auth.tokens, {
    contact: { name: tenant.businessName },
    reference: `${tenant.businessName} — ${periodLabel}`,
    lines: lines.map((line) => ({
      description: line.description,
      quantityThousandths: 1_000,
      unitPriceCents: line.cents,
    })),
  });

  return { xeroInvoiceId: created.xeroInvoiceId, invoiceNumber: created.invoiceNumber };
}
