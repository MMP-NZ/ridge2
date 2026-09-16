-- Same tenant_scoped_app pattern as 0011_jobs_rls.sql, for M6's tables.
--
-- No ridge_auth policy on any of these. Nothing here is ever reached
-- without a session: the customer never sees an invoice through this
-- platform (it goes to them from the roofer's own Xero), and commission is
-- between Juno Logic and the roofer.
--
-- xero_connections holds encrypted OAuth tokens, so the policy is doing
-- real work: even a staff session reads them through the same path, and
-- the tokens themselves are useless without SECRET_ENCRYPTION_KEY.

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

SELECT ridge_tenant_scoped_app_policy('xero_connections');
SELECT ridge_tenant_scoped_app_policy('invoices');
SELECT ridge_tenant_scoped_app_policy('invoice_payments');
SELECT ridge_tenant_scoped_app_policy('commission_entries');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "xero_connections", "invoices", "invoice_payments", "commission_entries" TO ridge_app;
