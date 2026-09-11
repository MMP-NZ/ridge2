-- Hand-written migration (Drizzle doesn't generate RLS policies).
--
-- Tenant isolation model, applied by role:
--
--   ridge_auth  Pre-authentication only. Can look up roofer_users /
--               staff_users by email and read/write sessions by token hash.
--               No visibility into tenant business data at all.
--
--   ridge_app   Used for every authenticated request. Two session variables
--               are SET LOCAL per request by the app, inside the request's
--               transaction, derived from the already-verified session
--               (never from client input):
--                 app.user_role  = 'roofer' | 'staff'
--                 app.tenant_id  = the roofer's own tenant (roofer sessions),
--                                  or the tenant being administered this
--                                  request (staff sessions)
--
--               A roofer session can only see/change rows where
--               tenant_id = app.tenant_id. A staff session can cross
--               tenants (app.user_role = 'staff' bypasses the tenant_id
--               check) — every staff query path that does this MUST write
--               an audit_log row in the same transaction; see
--               src/lib/auth/with-tenant-context.ts. If app.tenant_id or
--               app.user_role is not set for a request, current_setting(...)
--               returns NULL and every policy below evaluates to false —
--               fail closed, not fail open.
--
-- Every future tenant-owned table (leads, customers, quotes, jobs, ...)
-- should repeat the "tenant_scoped_app" policy pattern used on
-- roofer_users below.

-- Missing foreign keys (not expressed via drizzle's .references() to avoid
-- a circular schema import between sessions <-> roofer_users/staff_users).
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_roofer_user_id_roofer_users_id_fk"
  FOREIGN KEY ("roofer_user_id") REFERENCES "public"."roofer_users"("id") ON DELETE CASCADE;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_staff_user_id_staff_users_id_fk"
  FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE CASCADE;

-- A session belongs to exactly one user type, with the matching id set and
-- the other left null. Roofer sessions always carry their tenant; staff
-- sessions never do (staff pick a tenant to administer per-request).
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_type_shape_chk"
  CHECK (
    (user_type = 'roofer' AND roofer_user_id IS NOT NULL AND staff_user_id IS NULL AND tenant_id IS NOT NULL)
    OR
    (user_type = 'staff' AND staff_user_id IS NOT NULL AND roofer_user_id IS NULL AND tenant_id IS NULL)
  );

CREATE INDEX "roofer_users_tenant_id_idx" ON "roofer_users" ("tenant_id");
CREATE INDEX "audit_log_tenant_id_idx" ON "audit_log" ("tenant_id");
CREATE INDEX "audit_log_staff_user_id_idx" ON "audit_log" ("staff_user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at");

-- ---------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenants_app_access" ON "tenants" FOR ALL TO ridge_app
  USING (
    current_setting('app.user_role', true) = 'staff'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.user_role', true) = 'staff'
    OR id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------
-- roofer_users — reusable "tenant_scoped_app" pattern for future tables
-- ---------------------------------------------------------------------
ALTER TABLE "roofer_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roofer_users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "roofer_users_auth_lookup" ON "roofer_users" FOR SELECT TO ridge_auth
  USING (true);

CREATE POLICY "roofer_users_tenant_scoped_app" ON "roofer_users" FOR ALL TO ridge_app
  USING (
    current_setting('app.user_role', true) = 'staff'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.user_role', true) = 'staff'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------
-- staff_users — not tenant-owned; readable by both roles, only ridge_app
-- may write (staff onboarding happens through the admin console)
-- ---------------------------------------------------------------------
ALTER TABLE "staff_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "staff_users_auth_lookup" ON "staff_users" FOR SELECT TO ridge_auth
  USING (true);

CREATE POLICY "staff_users_app_access" ON "staff_users" FOR ALL TO ridge_app
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- sessions — only the pre-auth role touches this table
-- ---------------------------------------------------------------------
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "sessions_auth_full_access" ON "sessions" FOR ALL TO ridge_auth
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- audit_log — staff can write/read any tenant's rows (and must, for every
-- cross-tenant access they make); a roofer may only ever read their own.
-- ---------------------------------------------------------------------
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_staff_write" ON "audit_log" FOR ALL TO ridge_app
  USING (current_setting('app.user_role', true) = 'staff')
  WITH CHECK (current_setting('app.user_role', true) = 'staff');

CREATE POLICY "audit_log_roofer_read" ON "audit_log" FOR SELECT TO ridge_app
  USING (
    current_setting('app.user_role', true) = 'roofer'
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- ---------------------------------------------------------------------
-- Table privileges. RLS restricts rows; GRANTs restrict columns/statements.
-- ---------------------------------------------------------------------
GRANT SELECT ON "roofer_users", "staff_users" TO ridge_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON "sessions" TO ridge_auth;

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenants", "roofer_users", "staff_users", "audit_log" TO ridge_app;
