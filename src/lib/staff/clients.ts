import { desc, eq, sql } from "drizzle-orm";
import {
  tenants,
  xeroConnections,
  metaConnections,
  adBalances,
  leads,
  type Tenant,
} from "@/db/schema";
import { withStaffTenantContext } from "@/db/client";

export interface ClientRow {
  tenant: Tenant;
  xero: "connected" | "needs_reconnect" | "not_connected";
  metaConnected: boolean;
  adBalanceCents: number | null;
  leadCount: number;
}

const NIL_TENANT = "00000000-0000-0000-0000-000000000000";

/**
 * Every Juno Logic client, for the console's front page.
 *
 * Runs in a staff context rather than through withStaffTenantAccess: this
 * is a list of *whose* data exists, not a read of anyone's actual business
 * records, and writing an audit row per client every time someone loads the
 * home screen would bury the entries that matter under noise. Opening a
 * client is what gets logged.
 */
export async function listClients(): Promise<ClientRow[]> {
  return withStaffTenantContext(NIL_TENANT, async (tx) => {
    const all = await tx.select().from(tenants).orderBy(tenants.businessName);

    const rows: ClientRow[] = [];
    for (const tenant of all) {
      const [xero] = await tx.select().from(xeroConnections).where(eq(xeroConnections.tenantId, tenant.id));
      const [meta] = await tx.select().from(metaConnections).where(eq(metaConnections.tenantId, tenant.id));
      const [balance] = await tx.select().from(adBalances).where(eq(adBalances.tenantId, tenant.id));
      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.tenantId, tenant.id));

      rows.push({
        tenant,
        xero: !xero ? "not_connected" : xero.needsReconnectAt ? "needs_reconnect" : "connected",
        metaConnected: Boolean(meta),
        adBalanceCents: balance?.balanceCents ?? null,
        leadCount: counted?.count ?? 0,
      });
    }
    return rows;
  });
}

/** The tenant record itself, for a client page header. Not a data read, so not audited. */
export async function getClientTenant(tenantId: string): Promise<Tenant | null> {
  return withStaffTenantContext(NIL_TENANT, async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    return tenant ?? null;
  });
}

export interface AccessLogRow {
  id: string;
  tenantId: string;
  businessName: string;
  staffName: string;
  action: string;
  occurredAt: Date;
}

/**
 * The staff access log, across every client.
 *
 * The roofer can already see his own entries. Staff seeing the same list is
 * the point of an audit trail — it's only a deterrent if the people it
 * covers know it's there.
 */
export async function listAccessLog(limit = 100): Promise<AccessLogRow[]> {
  const { auditLog, staffUsers } = await import("@/db/schema");

  return withStaffTenantContext(NIL_TENANT, async (tx) => {
    const rows = await tx
      .select({
        id: auditLog.id,
        tenantId: auditLog.tenantId,
        businessName: tenants.businessName,
        staffName: staffUsers.name,
        action: auditLog.action,
        occurredAt: auditLog.occurredAt,
      })
      .from(auditLog)
      .innerJoin(tenants, eq(tenants.id, auditLog.tenantId))
      .innerJoin(staffUsers, eq(staffUsers.id, auditLog.staffUserId))
      .orderBy(desc(auditLog.occurredAt))
      .limit(limit);
    return rows;
  });
}
