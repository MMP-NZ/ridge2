import postgres from "postgres";
import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { roleDatabaseUrl } from "./urls";

// Lazy singletons — created on first use so this module can be imported in
// contexts (e.g. tooling) that don't have every DATABASE_* var set.
let authDbInstance: PostgresJsDatabase<typeof schema> | undefined;
let appDbInstance: PostgresJsDatabase<typeof schema> | undefined;

function getAppDb(): PostgresJsDatabase<typeof schema> {
  appDbInstance ??= drizzle(postgres(roleDatabaseUrl("ridge_app")), { schema });
  return appDbInstance;
}

/**
 * Pre-authentication database access: looking up a user by email to check
 * their password, and creating/verifying/deleting sessions by token hash.
 * Connects as ridge_auth, which cannot see tenant business data at all
 * (enforced by GRANT, not just RLS) — see src/db/migrations/0001_rls_policies.sql.
 */
export function authDb(): PostgresJsDatabase<typeof schema> {
  authDbInstance ??= drizzle(postgres(roleDatabaseUrl("ridge_auth")), { schema });
  return authDbInstance;
}

/**
 * For the health check. Connects as ridge_app, so a pass proves that role
 * exists, its password matches, and the database is reachable. It reads
 * no table, so it touches no tenant's data.
 */
export async function pingAppDb(): Promise<void> {
  await getAppDb().execute(rawSql`select 1`);
}

type TransactionCallback = Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0];
export type AppTx = Parameters<TransactionCallback>[0];

/**
 * Runs `fn` inside a transaction on the ridge_app role, with `app.user_role`
 * and `app.tenant_id` set for the lifetime of that transaction. Row-level
 * security policies read these two settings on every query the callback
 * makes — this is the ONLY place they should ever be set, and they must
 * come from an already-verified session, never from client input.
 *
 * Use withRooferTenantContext / withStaffTenantAccess below rather than
 * calling this directly, so the roofer-vs-staff distinction (and staff
 * audit logging) can't be forgotten at a call site.
 */
async function withTenantContext<T>(
  userRole: "roofer" | "staff" | "system",
  tenantId: string,
  fn: (tx: AppTx) => Promise<T>,
): Promise<T> {
  return getAppDb().transaction(async (tx) => {
    await tx.execute(
      rawSql`select set_config('app.user_role', ${userRole}, true), set_config('app.tenant_id', ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

/** A roofer acting within their own tenant. */
export function withRooferTenantContext<T>(tenantId: string, fn: (tx: AppTx) => Promise<T>): Promise<T> {
  return withTenantContext("roofer", tenantId, fn);
}

/**
 * Juno staff acting on a specific tenant's data. Bypasses the tenant_id
 * filter (app.user_role = 'staff' in the RLS policies) but the caller MUST
 * go through src/lib/auth/with-tenant-context.ts's withStaffTenantAccess
 * wrapper, not this function directly, so the access gets audit-logged.
 */
export function withStaffTenantContext<T>(tenantId: string, fn: (tx: AppTx) => Promise<T>): Promise<T> {
  return withTenantContext("staff", tenantId, fn);
}

/**
 * An unattended system process acting on a tenant's own data on its
 * behalf — e.g. the public website intake endpoint creating a lead with no
 * signed-in user at all (src/lib/crm/intake.ts). RLS treats this the same
 * as a roofer session (tenant-scoped, no cross-tenant bypass); the
 * distinct 'system' value is for audit/debugging clarity, not access
 * control — see src/db/schema/lead-events.ts's actorType.
 */
export function withSystemTenantContext<T>(tenantId: string, fn: (tx: AppTx) => Promise<T>): Promise<T> {
  return withTenantContext("system", tenantId, fn);
}
