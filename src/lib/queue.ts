import { PgBoss } from "pg-boss";
import { JOB_NAMES } from "@/lib/jobs/queue-names";

/**
 * Background job queue (reminders, follow-up sequences — M2 is the first
 * real use; Xero sync and webhooks come later). Postgres-backed via
 * pg-boss so this doesn't need Redis.
 *
 * pg-boss manages its own `pgboss` schema, so it needs a connection with
 * CREATE privileges — it runs against DATABASE_MIGRATE_URL, not the
 * request-scoped ridge_app role. pg-boss requires every queue to be
 * explicitly created before send()/work() will use it, so this ensures
 * all of them exist (idempotent — safe to call every time) whenever
 * something asks for the queue, whether that's a producer (web app) or
 * the consumer (src/worker.ts).
 */
let boss: PgBoss | undefined;
let queuesEnsured: Promise<void> | undefined;

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    const connectionString = process.env.DATABASE_MIGRATE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_MIGRATE_URL is not set (see .env.example)");
    }
    boss = new PgBoss({ connectionString });
    await boss.start();
  }

  queuesEnsured ??= (async () => {
    for (const name of Object.values(JOB_NAMES)) {
      await boss!.createQueue(name);
    }
  })();
  await queuesEnsured;

  return boss;
}
