import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withStaffTenantAccess, withRooferAccess } from "@/lib/auth/with-tenant-context";
import { truncateAllTables } from "./db-helpers";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

describe("staff access auditing", () => {
  test("withStaffTenantAccess writes exactly one audit_log row, visible to that tenant", async () => {
    const [tenant] = await ownerDb.insert(schema.tenants).values({ businessName: "Audited Roofing Co" }).returning();
    const [staff] = await ownerDb
      .insert(schema.staffUsers)
      .values({ email: "staffer@junologic.example", name: "Staffer", passwordHash: "not-a-real-hash" })
      .returning();

    await withStaffTenantAccess(staff.id, tenant.id, "lead.list", async (tx) => {
      return tx.select().from(schema.rooferUsers);
    });

    const entries = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id));
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("lead.list");
    expect(entries[0].staffUserId).toBe(staff.id);
  });

  test("if the wrapped action throws, no audit_log row is written (same transaction)", async () => {
    const [tenant] = await ownerDb.insert(schema.tenants).values({ businessName: "Failing Access Co" }).returning();
    const [staff] = await ownerDb
      .insert(schema.staffUsers)
      .values({ email: "staffer2@junologic.example", name: "Staffer Two", passwordHash: "not-a-real-hash" })
      .returning();

    await expect(
      withStaffTenantAccess(staff.id, tenant.id, "lead.list", async () => {
        throw new Error("simulated failure mid-access");
      }),
    ).rejects.toThrow("simulated failure mid-access");

    const entries = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id));
    expect(entries).toHaveLength(0);
  });

  test("a roofer can read their own tenant's audit log", async () => {
    const [tenant] = await ownerDb.insert(schema.tenants).values({ businessName: "Readable Log Co" }).returning();
    const [staff] = await ownerDb
      .insert(schema.staffUsers)
      .values({ email: "staffer3@junologic.example", name: "Staffer Three", passwordHash: "not-a-real-hash" })
      .returning();

    await withStaffTenantAccess(staff.id, tenant.id, "commission.statement.view", async () => {});

    const rows = await withRooferAccess(tenant.id, (tx) => tx.select().from(schema.auditLog));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("commission.statement.view");
  });

  test("a roofer cannot write to the audit log directly", async () => {
    const [tenant] = await ownerDb.insert(schema.tenants).values({ businessName: "Write Attempt Co" }).returning();
    const [staff] = await ownerDb
      .insert(schema.staffUsers)
      .values({ email: "staffer4@junologic.example", name: "Staffer Four", passwordHash: "not-a-real-hash" })
      .returning();

    await expect(
      withRooferAccess(tenant.id, (tx) =>
        tx.insert(schema.auditLog).values({ tenantId: tenant.id, staffUserId: staff.id, action: "forged" }),
      ),
    ).rejects.toThrow();
  });
});
