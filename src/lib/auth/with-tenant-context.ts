import { withRooferTenantContext, withStaffTenantContext, type AppTx } from "@/db/client";
import { auditLog } from "@/db/schema";

/**
 * The only sanctioned way for a Juno staff request to touch a tenant's
 * data. Runs `fn` with the tenant's RLS context set (staff bypass), then
 * writes an audit_log row in the SAME transaction — so if the audit insert
 * fails, the whole access rolls back. This is what makes "every staff
 * access is logged" a database-enforced guarantee rather than a habit.
 *
 * `action` should be a short machine-readable string (e.g.
 * "lead.list", "commission.statement.view") — see docs/decisions.md for
 * the convention once more actions exist.
 */
export async function withStaffTenantAccess<T>(
  staffUserId: string,
  tenantId: string,
  action: string,
  fn: (tx: AppTx) => Promise<T>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  return withStaffTenantContext(tenantId, async (tx) => {
    const result = await fn(tx);
    await tx.insert(auditLog).values({ tenantId, staffUserId, action, metadata });
    return result;
  });
}

/** A roofer acting within their own tenant — no audit logging needed, it's their own data. */
export function withRooferAccess<T>(tenantId: string, fn: (tx: AppTx) => Promise<T>): Promise<T> {
  return withRooferTenantContext(tenantId, fn);
}
