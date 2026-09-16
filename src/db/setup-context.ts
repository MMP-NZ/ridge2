import postgres from "postgres";
import { sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import type { AppTx } from "./client";
import { roleDatabaseUrl } from "./urls";

/**
 * For command-line setup scripts only (src/db/seed.ts, src/db/bootstrap.ts).
 * Never import this from the app.
 *
 * Writes go through ridge_app with `app.user_role = 'staff'`, so RLS decides
 * what is allowed, the same as for a staff request. That replaces connecting
 * as the migration role, which only ever worked because local and CI
 * Postgres run it as a superuser. On a hosted database the owner is not a
 * superuser, every table uses FORCE ROW LEVEL SECURITY, and no policy names
 * the owner, so each insert was denied.
 *
 * There is no audit_log row, because there is no staff member yet. This
 * sets up the platform itself and doesn't touch any roofer's existing data.
 */
export async function withSetupContext<T>(fn: (tx: AppTx) => Promise<T>): Promise<T> {
  const connection = postgres(roleDatabaseUrl("ridge_app"), { max: 1 });
  try {
    return await drizzle(connection, { schema }).transaction(async (tx) => {
      await tx.execute(rawSql`select set_config('app.user_role', 'staff', true)`);
      return fn(tx);
    });
  } finally {
    await connection.end();
  }
}
