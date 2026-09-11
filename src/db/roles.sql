-- Run once per database (local dev, CI, staging, prod) as a superuser/owner,
-- before running migrations:
--   psql "$DATABASE_MIGRATE_URL" -v dbname="$(psql "$DATABASE_MIGRATE_URL" -Atc 'select current_database()')" -f src/db/roles.sql
-- (src/db/migrate.ts runs the equivalent of this automatically before applying migrations.)
--
-- Creates the two least-privilege roles the app uses at runtime, so that
-- "tenant isolation enforced in the database" is true even if application
-- code has a bug.
--
-- ridge_auth: used ONLY for the pre-authentication lookup path (find a user
--   by email to check their password, verify/create a session by token
--   hash). Cannot see tenant-owned business data at all.
-- ridge_app: used for all authenticated requests. Row-level security scopes
--   it to the caller's tenant, except staff sessions which are allowed to
--   cross tenants (enforced at the app layer to also write an audit_log row
--   — see src/lib/auth/with-tenant-context.ts).
--
-- Neither role has BYPASSRLS or superuser privileges.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ridge_auth') THEN
    CREATE ROLE ridge_auth LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ridge_app') THEN
    CREATE ROLE ridge_app LOGIN;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE :dbname TO ridge_auth, ridge_app;
GRANT USAGE ON SCHEMA public TO ridge_auth, ridge_app;
