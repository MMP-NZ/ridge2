import PgBoss from "pg-boss";

/**
 * Background job queue (reminders, follow-up sequences, Xero sync,
 * webhooks — all from M2 onward). Postgres-backed via pg-boss so M0 doesn't
 * need to stand up Redis just to prove the queue works.
 *
 * pg-boss manages its own `pgboss` schema, so it needs a connection with
 * CREATE privileges — it runs against DATABASE_MIGRATE_URL, not the
 * request-scoped ridge_app role. No jobs are registered yet; this only
 * proves the dependency starts cleanly. First real job lands in M2.
 */
let boss: PgBoss | undefined;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  const connectionString = process.env.DATABASE_MIGRATE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_MIGRATE_URL is not set (see .env.example)");
  }
  boss = new PgBoss({ connectionString });
  await boss.start();
  return boss;
}
