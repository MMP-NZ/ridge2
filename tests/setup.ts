import { config } from "dotenv";
import { beforeAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
config();

// Point every DB-touching module at the disposable test database instead of
// dev, for the lifetime of the test process.
for (const key of ["AUTH_URL", "URL", "MIGRATE_URL"] as const) {
  const testValue = process.env[`DATABASE_TEST_${key}`];
  if (!testValue) {
    throw new Error(`DATABASE_TEST_${key} is not set (see .env.example) — tests refuse to run against a non-test database`);
  }
  process.env[`DATABASE_${key}`] = testValue;
}

beforeAll(async () => {
  const migrateUrl = process.env.DATABASE_MIGRATE_URL!;
  const sql = postgres(migrateUrl, { max: 1 });
  try {
    const [{ current_database: dbName }] = await sql<{ current_database: string }[]>`select current_database()`;
    const rolesSql = readFileSync(path.join(__dirname, "..", "src", "db", "roles.sql"), "utf8").replaceAll(
      ":dbname",
      `"${dbName}"`,
    );
    await sql.unsafe(rolesSql);

    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: path.join(__dirname, "..", "src", "db", "migrations") });
  } finally {
    await sql.end();
  }
});
