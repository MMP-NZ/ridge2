-- Same tenant_scoped_app pattern as 0003_leads_crm_rls.sql, for M2's new tables.

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

SELECT ridge_tenant_scoped_app_policy('calendar_rules');
SELECT ridge_tenant_scoped_app_policy('visits');
SELECT ridge_tenant_scoped_app_policy('messages');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON "calendar_rules", "visits", "messages" TO ridge_app;

-- The public /book/[bookingToken] page (src/lib/booking/public-lookup.ts)
-- has no session and so no tenant context yet — it needs to resolve which
-- lead/tenant a token belongs to before anything else. Same pattern as
-- roofer_users/staff_users (login by email) and tenants (intake key
-- lookup): ridge_auth gets unfiltered SELECT on this one table, and app
-- code is the thing that only ever queries it by the unguessable token.
-- Everything else about the booking flow (tenant name, property, slots)
-- goes through the normal withSystemTenantContext path once the tenant_id
-- is known.
CREATE POLICY "leads_auth_lookup" ON "leads" FOR SELECT TO ridge_auth
  USING (true);

GRANT SELECT ON "leads" TO ridge_auth;
