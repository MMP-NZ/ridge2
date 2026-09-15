import postgres from "postgres";

/** Truncates all app tables (cascade) using the migration/owner connection — for use between tests. */
export async function truncateAllTables(): Promise<void> {
  const sql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
  try {
    await sql`truncate table audit_log, jobs, quote_lines, quotes, visit_photos, price_book_items, ad_balance_entries, ad_balances, meta_lead_deliveries, meta_connections, messages, visits, calendar_rules, lead_events, leads, properties, customers, sessions, roofer_users, staff_users, tenants restart identity cascade`;
  } finally {
    await sql.end();
  }
}
