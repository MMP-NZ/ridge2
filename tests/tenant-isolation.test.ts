import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext, withStaffTenantContext } from "@/db/client";
import { truncateAllTables } from "./db-helpers";

// Fixtures are created with the migration/owner role, which (as a
// superuser locally, or a BYPASSRLS role in production — see docs/deploy.md)
// bypasses RLS, so this file can set up cross-tenant data without going
// through the very access control it's testing.
const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

async function makeTenantWithRoofer(businessName: string) {
  const [tenant] = await ownerDb.insert(schema.tenants).values({ businessName }).returning();
  const [roofer] = await ownerDb
    .insert(schema.rooferUsers)
    .values({
      tenantId: tenant.id,
      email: `${businessName.toLowerCase().replace(/\s+/g, "-")}@example.com`,
      passwordHash: "not-a-real-hash",
    })
    .returning();
  return { tenant, roofer };
}

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

describe("tenant isolation (RLS)", () => {
  test("a roofer session only ever sees its own tenant's rows, with no WHERE clause needed", async () => {
    const { tenant: tenantA, roofer: rooferA } = await makeTenantWithRoofer("Tenant A Roofing");
    const { roofer: rooferB } = await makeTenantWithRoofer("Tenant B Roofing");

    const rows = await withRooferTenantContext(tenantA.id, (tx) => tx.select().from(schema.rooferUsers));

    expect(rows.map((r) => r.id)).toEqual([rooferA.id]);
    expect(rows.map((r) => r.id)).not.toContain(rooferB.id);
  });

  test("a roofer session cannot update another tenant's row, even by primary key", async () => {
    const { tenant: tenantA } = await makeTenantWithRoofer("Tenant C Roofing");
    const { roofer: rooferD } = await makeTenantWithRoofer("Tenant D Roofing");

    const updated = await withRooferTenantContext(tenantA.id, (tx) =>
      tx
        .update(schema.rooferUsers)
        .set({ phone: "+64211111111" })
        .where(eq(schema.rooferUsers.id, rooferD.id))
        .returning(),
    );

    expect(updated).toHaveLength(0);

    const [stillUnchanged] = await ownerDb.select().from(schema.rooferUsers).where(eq(schema.rooferUsers.id, rooferD.id));
    expect(stillUnchanged.phone).toBeNull();
  });

  test("a roofer session cannot delete another tenant's row", async () => {
    const { tenant: tenantA } = await makeTenantWithRoofer("Tenant E Roofing");
    const { roofer: rooferF } = await makeTenantWithRoofer("Tenant F Roofing");

    const deleted = await withRooferTenantContext(tenantA.id, (tx) =>
      tx.delete(schema.rooferUsers).where(eq(schema.rooferUsers.id, rooferF.id)).returning(),
    );

    expect(deleted).toHaveLength(0);
    const stillThere = await ownerDb.select().from(schema.rooferUsers).where(eq(schema.rooferUsers.id, rooferF.id));
    expect(stillThere).toHaveLength(1);
  });

  test("the ridge_app role sees zero rows if tenant context was never set (fail closed, not fail open)", async () => {
    await makeTenantWithRoofer("Tenant G Roofing");

    const appSql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      // No SET LOCAL app.user_role / app.tenant_id at all.
      const rows = await appSql`select * from roofer_users`;
      expect(rows).toHaveLength(0);
    } finally {
      await appSql.end();
    }
  });

  test("a staff session can read across tenants (the deliberate bypass)", async () => {
    const { roofer: rooferA } = await makeTenantWithRoofer("Tenant H Roofing");
    const { tenant: tenantB, roofer: rooferB } = await makeTenantWithRoofer("Tenant I Roofing");

    // tenantId passed here only sets app.tenant_id; the staff bypass policy
    // doesn't actually depend on it, which is what this test proves.
    const rows = await withStaffTenantContext(tenantB.id, (tx) => tx.select().from(schema.rooferUsers));

    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual([rooferA.id, rooferB.id].sort());
  });
});
