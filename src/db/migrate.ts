import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ROLE_PASSWORD_VAR } from "./urls";

config({ path: ".env.local" });
config();

const migrateUrl = process.env.DATABASE_MIGRATE_URL;
if (!migrateUrl) {
  throw new Error("DATABASE_MIGRATE_URL is not set (see .env.example)");
}

// src/db when run with tsx, dist/ in the Docker image — the Dockerfile
// copies migrations/ and roles.sql next to the bundle so both resolve.
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

/**
 * Local dev uses trust auth and leaves these unset. On hosted Postgres the
 * runtime roles need real passwords, and src/db/urls.ts builds their
 * connection strings from the same variables — so setting the password on
 * every deploy keeps the two from ever drifting apart.
 *
 * ALTER ROLE can't take a bind parameter, so Postgres's own format() quotes
 * the value rather than string-building it here.
 */
async function setRolePasswords(sql: postgres.Sql) {
  for (const role of ["ridge_app", "ridge_auth"] as const) {
    const password = process.env[ROLE_PASSWORD_VAR[role]];
    if (!password) continue;

    const [{ statement }] = await sql<{ statement: string }[]>`
      select format('ALTER ROLE %I WITH PASSWORD %L', ${role}::text, ${password}::text) as statement
    `;
    await sql.unsafe(statement);
    console.log(`Password set for ${role}.`);
  }
}

async function main() {
  const sql = postgres(migrateUrl!, { max: 1 });
  try {
    console.log("Ensuring ridge_auth / ridge_app roles exist...");
    await ensureRoles(sql);
    await setRolePasswords(sql);

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
