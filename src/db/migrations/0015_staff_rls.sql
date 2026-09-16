-- M7's tables, and the one place in this schema where the usual pattern
-- doesn't apply.
--
-- platform_invoices, max_hours_entries and onboarding_steps carry a
-- tenant_id and get the normal tenant-scoped policy, which means a roofer
-- session can read his own billing history. That's deliberate — he should
-- be able to see what he's been charged. MAX hours are never surfaced in
-- the roofer app, but the policy is per-table and consistency is worth more
-- here than a special case.
--
-- platform_xero_connection is different: it is Juno Logic's own accounting
-- credentials, belongs to no tenant, and must never be readable by a roofer
-- session. It gets a staff-only policy instead.

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

SELECT ridge_tenant_scoped_app_policy('platform_invoices');
SELECT ridge_tenant_scoped_app_policy('max_hours_entries');
SELECT ridge_tenant_scoped_app_policy('onboarding_steps');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

-- Staff only. A roofer session has app.user_role = 'roofer', so this
-- returns nothing for him no matter what he asks for.
ALTER TABLE "platform_xero_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_xero_connection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform_xero_connection_staff_only" ON "platform_xero_connection" FOR ALL TO ridge_app
  USING (current_setting('app.user_role', true) = 'staff')
  WITH CHECK (current_setting('app.user_role', true) = 'staff');

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "platform_invoices", "max_hours_entries", "onboarding_steps", "platform_xero_connection" TO ridge_app;
