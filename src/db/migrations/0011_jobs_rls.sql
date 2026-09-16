-- Same tenant_scoped_app pattern as 0009_quotes_rls.sql, for M5's new tables.
--
-- Note `jobs` itself already got its policy in 0009 — this covers only the
-- scheduling tables added here. No ridge_auth policy either: nothing about a
-- job is public. The customer is told when the work is happening by text and
-- email, not by a page they can open.

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

SELECT ridge_tenant_scoped_app_policy('job_days');
SELECT ridge_tenant_scoped_app_policy('job_photos');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON "job_days", "job_photos" TO ridge_app;
