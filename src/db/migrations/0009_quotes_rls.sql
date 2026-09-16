-- Same tenant_scoped_app pattern as 0005_booking_rls.sql, for M4's new tables.

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

SELECT ridge_tenant_scoped_app_policy('price_book_items');
SELECT ridge_tenant_scoped_app_policy('quotes');
SELECT ridge_tenant_scoped_app_policy('quote_lines');
SELECT ridge_tenant_scoped_app_policy('visit_photos');
SELECT ridge_tenant_scoped_app_policy('jobs');

DROP FUNCTION ridge_tenant_scoped_app_policy(regclass);

GRANT SELECT, INSERT, UPDATE, DELETE ON "price_book_items", "quotes", "quote_lines", "visit_photos", "jobs" TO ridge_app;

-- The public /quote/[quoteToken] page has no session and so no tenant context
-- yet, exactly like /book/[bookingToken] in M2 (see leads_auth_lookup in
-- 0005_booking_rls.sql): it must resolve which tenant a token belongs to
-- before anything else can be scoped. ridge_auth gets unfiltered SELECT on
-- this one table and app code only ever queries it by the unguessable token;
-- everything else the quote page shows (business name, property, lines,
-- photos) is read back through the normal withSystemTenantContext path once
-- the tenant_id is known.
CREATE POLICY "quotes_auth_lookup" ON "quotes" FOR SELECT TO ridge_auth
  USING (true);

GRANT SELECT ON "quotes" TO ridge_auth;
