-- Same tenant_scoped_app pattern as 0003/0005, for M3's new tables.

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

SELECT ridge_tenant_scoped_app_policy('meta_connections');
SELECT ridge_tenant_scoped_app_policy('meta_lead_deliveries');
SELECT ridge_tenant_scoped_app_policy('ad_balances');
SELECT ridge_tenant_scoped_app_policy('ad_balance_entries');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON "meta_connections", "meta_lead_deliveries", "ad_balances", "ad_balance_entries" TO ridge_app;

-- The leadgen webhook receiver has no session (Meta calls us directly) and
-- must resolve which tenant a delivery is for by page_id BEFORE any tenant
-- context exists — same pre-authentication pattern as tenants (M1's
-- intake key) and leads (M2's booking token): ridge_auth gets unfiltered
-- SELECT on this one table, app code only ever queries it by page_id.
CREATE POLICY "meta_connections_auth_lookup" ON "meta_connections" FOR SELECT TO ridge_auth
  USING (true);

GRANT SELECT ON "meta_connections" TO ridge_auth;
