import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

config({ path: ".env.local" });
config();

const migrateUrl = process.env.DATABASE_MIGRATE_URL;
if (!migrateUrl) {
  throw new Error("DATABASE_MIGRATE_URL is not set (see .env.example)");
}

const dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureRoles(sql: postgres.Sql) {
  const [{ current_database: dbName }] = await sql<{ current_database: string }[]>`
    select current_database()
  `;
  const rolesSql = readFileSync(path.join(dirname, "roles.sql"), "utf8");
  // roles.sql uses the psql :dbname variable; substitute it directly since
  // we're not running through psql here.
  const withDbName = rolesSql.replaceAll(":dbname", `"${dbName}"`);
  await sql.unsafe(withDbName);
}

async function main() {
  const sql = postgres(migrateUrl!, { max: 1 });
  try {
    console.log("Ensuring ridge_auth / ridge_app roles exist...");
    await ensureRoles(sql);

    console.log("Running migrations...");
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: path.join(dirname, "migrations") });

    console.log("Migrations complete.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
