import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext, withStaffTenantContext } from "@/db/client";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

// Fixtures are created with the migration/owner role, which (as a
// superuser locally, or a BYPASSRLS role in production — see docs/deploy.md)
// bypasses RLS, so this file can set up cross-tenant data without going
// through the very access control it's testing.
const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

async function makeTenantWithRoofer(businessName: string) {
  const tenant = await makeTenant(ownerDb, businessName);
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

/**
 * M4's tables carry a roofer's pricing and his customers' quotes and site
 * photos — the most commercially sensitive rows in the system. CLAUDE.md
 * requires isolation to be proven per table, not assumed from the shared
 * policy helper, so every one of them is exercised here.
 */
describe("tenant isolation covers M4's quote tables", () => {
  /** One full chain of M4 rows for a tenant, inserted with the RLS-bypassing owner role. */
  async function makeQuoteChain(businessName: string) {
    const tenant = await makeTenant(ownerDb, businessName);
    const slug = businessName.toLowerCase().replace(/\s+/g, "-");

    const [customer] = await ownerDb
      .insert(schema.customers)
      .values({ tenantId: tenant.id, name: `${businessName} Customer`, email: `${slug}@example.com` })
      .returning();
    const [property] = await ownerDb
      .insert(schema.properties)
      .values({ tenantId: tenant.id, customerId: customer.id, address: `1 ${businessName} Road` })
      .returning();
    const [lead] = await ownerDb
      .insert(schema.leads)
      .values({
        tenantId: tenant.id,
        customerId: customer.id,
        propertyId: property.id,
        source: "roofer_own",
        bookingToken: `booking-${slug}`,
      })
      .returning();
    const [visit] = await ownerDb
      .insert(schema.visits)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        startAt: new Date("2026-10-06T21:00:00Z"),
        endAt: new Date("2026-10-06T21:45:00Z"),
      })
      .returning();
    const [priceBookItem] = await ownerDb
      .insert(schema.priceBookItems)
      .values({ tenantId: tenant.id, name: "Roof painting", kind: "per_m2", unitPriceCents: 4_850 })
      .returning();
    const [quote] = await ownerDb
      .insert(schema.quotes)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        customerId: customer.id,
        propertyId: property.id,
        visitId: visit.id,
        quoteToken: `quote-${slug}`,
        subtotalExGstCents: 60_625,
        gstCents: 9_094,
        totalIncGstCents: 69_719,
      })
      .returning();
    const [quoteLine] = await ownerDb
      .insert(schema.quoteLines)
      .values({
        tenantId: tenant.id,
        quoteId: quote.id,
        description: "Roof painting",
        kind: "per_m2",
        quantityThousandths: 12_500,
        unitPriceCents: 4_850,
        lineTotalExGstCents: 60_625,
      })
      .returning();
    const [visitPhoto] = await ownerDb
      .insert(schema.visitPhotos)
      .values({
        tenantId: tenant.id,
        visitId: visit.id,
        clientPhotoId: crypto.randomUUID(),
        storageKey: `tenants/${tenant.id}/visits/${visit.id}/photo.jpg`,
        contentType: "image/jpeg",
        byteSize: 1_024,
      })
      .returning();
    const [job] = await ownerDb
      .insert(schema.jobs)
      .values({
        tenantId: tenant.id,
        quoteId: quote.id,
        leadId: lead.id,
        customerId: customer.id,
        propertyId: property.id,
      })
      .returning();

    return { tenant, priceBookItem, quote, quoteLine, visitPhoto, job };
  }

  const tables = [
    { name: "price_book_items", table: schema.priceBookItems, pick: (c: QuoteChain) => c.priceBookItem.id },
    { name: "quotes", table: schema.quotes, pick: (c: QuoteChain) => c.quote.id },
    { name: "quote_lines", table: schema.quoteLines, pick: (c: QuoteChain) => c.quoteLine.id },
    { name: "visit_photos", table: schema.visitPhotos, pick: (c: QuoteChain) => c.visitPhoto.id },
    { name: "jobs", table: schema.jobs, pick: (c: QuoteChain) => c.job.id },
  ] as const;

  type QuoteChain = Awaited<ReturnType<typeof makeQuoteChain>>;

  for (const { name, table, pick } of tables) {
    test(`a roofer reads only his own rows from ${name}`, async () => {
      const mine = await makeQuoteChain("Isolation Mine");
      const theirs = await makeQuoteChain("Isolation Theirs");

      const rows = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(table));
      const ids = rows.map((r) => r.id);

      expect(ids).toEqual([pick(mine)]);
      expect(ids).not.toContain(pick(theirs));
    });

    test(`a roofer cannot delete another tenant's ${name} row, even by primary key`, async () => {
      const mine = await makeQuoteChain("Isolation Deleter");
      const theirs = await makeQuoteChain("Isolation Victim");
      const victimId = pick(theirs);

      const deleted = await withRooferTenantContext(mine.tenant.id, (tx) =>
        tx.delete(table).where(eq(table.id, victimId)).returning(),
      );

      expect(deleted).toHaveLength(0);
      const stillThere = await ownerDb.select().from(table).where(eq(table.id, victimId));
      expect(stillThere).toHaveLength(1);
    });
  }

  test("Juno staff can read quotes across tenants, which M7's admin console needs", async () => {
    const mine = await makeQuoteChain("Isolation Staff A");
    const theirs = await makeQuoteChain("Isolation Staff B");

    const rows = await withStaffTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.quotes));

    expect(rows.map((r) => r.id).sort()).toEqual([mine.quote.id, theirs.quote.id].sort());
  });

  test("the public quote-token lookup role can resolve a token but cannot read quote lines", async () => {
    const { quote } = await makeQuoteChain("Isolation Token Co");

    // ridge_auth is the pre-authentication role the public /quote/[token]
    // page uses to find out which tenant a token belongs to. It is granted
    // SELECT on quotes alone — everything else must go through a tenant
    // context once the tenant is known.
    const authSql = postgres(process.env.DATABASE_AUTH_URL!, { max: 1 });
    try {
      const found = await authSql`select id from quotes where quote_token = ${quote.quoteToken}`;
      expect(found.map((r) => r.id)).toEqual([quote.id]);

      await expect(authSql`select * from quote_lines`).rejects.toThrow(/permission denied/i);
    } finally {
      await authSql.end();
    }
  });
});
