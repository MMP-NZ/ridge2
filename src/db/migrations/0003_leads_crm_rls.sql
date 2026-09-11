-- Hand-written migration (see 0001_rls_policies.sql for the pattern this
-- repeats). customers, properties, leads, lead_events are all tenant-owned:
-- FORCE RLS, staff-bypass-OR-tenant-match, granted to ridge_app only.
--
-- tenants also gets a new SELECT grant for ridge_auth: the public website
-- intake endpoint (src/lib/crm/intake.ts) needs to resolve a tenant by
-- public_intake_key BEFORE any roofer/staff session exists — the same
-- "pre-authentication lookup" pattern already used for roofer_users/
-- staff_users by email. The actual customer/property/lead write still goes
-- through withRooferTenantContext (ridge_app, RLS-enforced), not a bypass.

CREATE POLICY "tenants_auth_lookup" ON "tenants" FOR SELECT TO ridge_auth
  USING (true);

GRANT SELECT ON "tenants" TO ridge_auth;

-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ridge_tenant_scoped_app_policy(tbl regclass) RETURNS void AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY %I ON %s FOR ALL TO ridge_app USING (
       current_setting(''app.user_role'', true) = ''staff''
       OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid
     ) WITH CHECK (
       current_setting(''app.user_role'', true) = ''staff''
       OR tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid
     )',
    tbl::text || '_tenant_scoped_app',
    tbl
  );
END;
$$ LANGUAGE plpgsql;

SELECT ridge_tenant_scoped_app_policy('customers');
SELECT ridge_tenant_scoped_app_policy('properties');
SELECT ridge_tenant_scoped_app_policy('leads');
SELECT ridge_tenant_scoped_app_policy('lead_events');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON "customers", "properties", "leads", "lead_events" TO ridge_app;
