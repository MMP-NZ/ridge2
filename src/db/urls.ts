/**
 * Connection strings for the two runtime roles.
 *
 * Locally and in CI these are set directly (DATABASE_URL, DATABASE_AUTH_URL).
 * On a hosted Postgres such as Render, the platform only hands out the
 * owner's connection string, and a Blueprint can't compose one variable
 * from another. So when the direct URL is missing, the role's URL is built
 * from the owner's host, port and database plus that role's own password —
 * the same password src/db/migrate.ts sets on the role.
 */
export type RuntimeRole = "ridge_app" | "ridge_auth";

const DIRECT_URL_VAR: Record<RuntimeRole, string> = {
  ridge_app: "DATABASE_URL",
  ridge_auth: "DATABASE_AUTH_URL",
};

export const ROLE_PASSWORD_VAR: Record<RuntimeRole, string> = {
  ridge_app: "RIDGE_APP_PASSWORD",
  ridge_auth: "RIDGE_AUTH_PASSWORD",
};

export function roleDatabaseUrl(role: RuntimeRole, env: NodeJS.ProcessEnv = process.env): string {
  const direct = env[DIRECT_URL_VAR[role]];
  if (direct) return direct;

  const ownerUrl = env.DATABASE_MIGRATE_URL;
  const password = env[ROLE_PASSWORD_VAR[role]];
  if (!ownerUrl || !password) {
    throw new Error(
      `${DIRECT_URL_VAR[role]} is not set, and it can't be derived without DATABASE_MIGRATE_URL and ${ROLE_PASSWORD_VAR[role]} (see .env.example)`,
    );
  }

  const url = new URL(ownerUrl);
  // Assigning through URL percent-encodes, so a generated password
  // containing + / = can't break the connection string.
  url.username = role;
  url.password = password;
  return url.toString();
}
