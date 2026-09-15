import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { recordTopUp } from "@/lib/ads/balance";
import { previewBillingRun, runBilling, periodMonthKey } from "@/lib/billing/run";
import { savePlatformTokens } from "@/lib/billing/platform-xero";
import { getFakeXero, resetFakeXero } from "@/lib/xero/client";
import { withStaffTenantContext } from "@/db/client";
import { exportTenant } from "@/lib/export/tenant-export";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });
const d = (dollars: number) => Math.round(dollars * 100);

const NIL = "00000000-0000-0000-0000-000000000000";

beforeEach(async () => {
  await truncateAllTables();
  resetFakeXero();
});

/** Connects Juno Logic's own Xero — the books invoices to roofers land in. */
async function connectPlatformXero() {
  const tokens = await getFakeXero().exchangeCode("code", "redirect");
  await withStaffTenantContext(NIL, (tx) => savePlatformTokens(tx, tokens));
}

afterAll(async () => {
  await ownerSql.end();
});

async function makeStaff(email = "staff@junologic.example") {
  const [staff] = await ownerDb
    .insert(schema.staffUsers)
    .values({ email, name: "Staffer", passwordHash: "not-a-real-hash" })
    .returning();
  return staff;
}

/** A tenant with a lead, so an export has something in it. */
async function makeClient(businessName: string, overrides: Partial<typeof schema.tenants.$inferInsert> = {}) {
  const tenant = await makeTenant(ownerDb, businessName);
  if (Object.keys(overrides).length > 0) {
    await ownerDb.update(schema.tenants).set(overrides).where(eq(schema.tenants.id, tenant.id));
  }

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, { name: "A Customer", email: "a@example.com" });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "1 Somewhere Street");
    return createLead(
      tx,
      tenant.id,
      { customerId: customer.id, propertyId: property.id, source: "juno_website" },
      { type: "system" },
    );
  });

  const [fresh] = await ownerDb.select().from(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  return { tenant: fresh, lead };
}

const THIS_MONTH = new Date();

describe("the monthly billing run", () => {
  test("previews every client without billing anyone", async () => {
    await makeClient("Preview A");
    await makeClient("Preview B");

    const preview = await previewBillingRun(THIS_MONTH);

    expect(preview).toHaveLength(2);
    expect(preview.every((row) => row.alreadyBilled === null)).toBe(true);
    // Nothing raised — that's the whole point of a preview.
    expect(await ownerDb.select().from(schema.platformInvoices)).toHaveLength(0);
  });

  /** Build-plan M7 done-when: plan fee, commission and ad top-ups as separate lines. */
  test("raises one invoice per client with the three lines kept apart", async () => {
    const staff = await makeStaff();
    const { tenant } = await makeClient("Three Lines Co");
    await recordTopUp(staff.id, tenant.id, d(350), "October top-up");

    // Commission for the month, as M6 would have written it.
    const [customer] = await ownerDb.select().from(schema.customers).where(eq(schema.customers.tenantId, tenant.id));
    const [property] = await ownerDb.select().from(schema.properties).where(eq(schema.properties.tenantId, tenant.id));
    const [lead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    const [quote] = await ownerDb
      .insert(schema.quotes)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        customerId: customer.id,
        propertyId: property.id,
        quoteToken: `bill-${crypto.randomUUID()}`,
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
    const [invoice] = await ownerDb
      .insert(schema.invoices)
      .values({ tenantId: tenant.id, jobId: job.id, xeroInvoiceId: "x-1" })
      .returning();
    const [payment] = await ownerDb
      .insert(schema.invoicePayments)
      .values({
        tenantId: tenant.id,
        invoiceId: invoice.id,
        xeroPaymentId: "p-1",
        amountExGstCents: d(7_000),
        paidAt: new Date(),
      })
      .returning();
    await ownerDb.insert(schema.commissionEntries).values({
      tenantId: tenant.id,
      jobId: job.id,
      invoicePaymentId: payment.id,
      amountCents: d(420),
      rateBp: 600,
      capCents: d(5_000),
      netPaidExGstCents: d(7_000),
      runningCommissionCents: d(420),
      eligibilityReason: "juno_sourced",
    });

    const result = await runBilling(THIS_MONTH);

    expect(result.raised).toHaveLength(1);
    const raised = result.raised[0];
    expect(raised.planFeeCents).toBe(d(200));
    expect(raised.commissionCents).toBe(d(420));
    expect(raised.adTopUpsCents).toBe(d(350));
    expect(raised.totalExGstCents).toBe(d(970));
  });

  /** Build-plan M7 done-when: the invoice shows the three lines separately. */
  test("raises the invoice in Juno Logic's Xero with a line each", async () => {
    const staff = await makeStaff();
    const { tenant } = await makeClient("Xero Lines Co");
    await connectPlatformXero();
    await recordTopUp(staff.id, tenant.id, d(350));

    const result = await runBilling(THIS_MONTH);

    expect(result.raised).toHaveLength(1);
    expect(result.recordedWithoutXero).toBe(0);
    expect(result.raised[0].xeroInvoiceId).not.toBeNull();

    const raised = getFakeXero().getStoredInvoice(result.raised[0].xeroInvoiceId!);
    expect(raised).toBeDefined();
    // Plan fee and ad top-ups; commission is zero this month so its line is
    // dropped rather than shown at $0.00.
    expect(raised!.totalExGstCents).toBe(d(550));
  });

  test("records the month even when Juno Logic's Xero isn't connected", async () => {
    await makeClient("No Platform Xero Co");

    const result = await runBilling(THIS_MONTH);

    // Billed and recorded — the run doesn't half-fail and leave nobody sure
    // who has been charged.
    expect(result.raised).toHaveLength(1);
    expect(result.recordedWithoutXero).toBe(1);
    expect(result.raised[0].xeroInvoiceId).toBeNull();
  });

  test("running the same month twice doesn't bill anyone twice", async () => {
    await makeClient("Twice Co");

    const first = await runBilling(THIS_MONTH);
    const second = await runBilling(THIS_MONTH);

    expect(first.raised).toHaveLength(1);
    expect(second.raised).toHaveLength(0);
    expect(second.skippedAlreadyBilled).toBe(1);
    expect(await ownerDb.select().from(schema.platformInvoices)).toHaveLength(1);
  });

  test("a client who owes nothing gets no invoice rather than a $0 one", async () => {
    // In his free month, no commission, no top-ups.
    const freeUntil = new Date();
    freeUntil.setMonth(freeUntil.getMonth() + 1);
    await makeClient("Free Month Co", { freeMonthEndsAt: freeUntil });

    const result = await runBilling(THIS_MONTH);

    expect(result.raised).toHaveLength(0);
    expect(result.skippedNothingOwing).toBe(1);
  });

  test("but a free-month client with commission is still billed for it", async () => {
    const staff = await makeStaff();
    const freeUntil = new Date();
    freeUntil.setMonth(freeUntil.getMonth() + 1);
    const { tenant } = await makeClient("Free But Owing Co", { freeMonthEndsAt: freeUntil });
    await recordTopUp(staff.id, tenant.id, d(100));

    const result = await runBilling(THIS_MONTH);

    expect(result.raised).toHaveLength(1);
    expect(result.raised[0].planFeeCents).toBe(0);
    expect(result.raised[0].adTopUpsCents).toBe(d(100));
  });

  test("the period is stored as the first of the month", async () => {
    await makeClient("Period Co");
    const result = await runBilling(THIS_MONTH);

    expect(result.raised[0].periodMonth).toBe(periodMonthKey(THIS_MONTH));
    expect(result.raised[0].periodMonth).toMatch(/-01$/);
  });
});

/** Build-plan M7 done-when: the export contains the roofer's records. */
describe("exporting a roofer's data", () => {
  test("contains every kind of record the build plan names", async () => {
    const staff = await makeStaff();
    const { tenant } = await makeClient("Export Co");

    const bundle = await exportTenant(staff.id, tenant.id);

    // The build plan lists these by name.
    expect(bundle.customers.length).toBeGreaterThan(0);
    expect(bundle.properties.length).toBeGreaterThan(0);
    expect(bundle.leads.length).toBeGreaterThan(0);
    for (const key of ["quotes", "jobs", "messages", "invoices"] as const) {
      expect(Array.isArray(bundle[key])).toBe(true);
    }
    expect(bundle.tenant).toMatchObject({ businessName: "Export Co" });
    expect(bundle.exportedAt).toMatch(/^\d{4}-/);
  });

  test("contains nothing belonging to another roofer", async () => {
    const staff = await makeStaff();
    const mine = await makeClient("Export Mine");
    await makeClient("Export Theirs");

    const bundle = await exportTenant(staff.id, mine.tenant.id);

    expect(bundle.customers).toHaveLength(1);
    for (const customer of bundle.customers as Array<{ tenantId: string }>) {
      expect(customer.tenantId).toBe(mine.tenant.id);
    }
    for (const lead of bundle.leads as Array<{ tenantId: string }>) {
      expect(lead.tenantId).toBe(mine.tenant.id);
    }
  });

  test("is itself written to the audit log the roofer can see", async () => {
    const staff = await makeStaff();
    const { tenant } = await makeClient("Audited Export Co");

    await exportTenant(staff.id, tenant.id);

    const entries = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id));
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe("tenant.export");
    expect(entries[0].staffUserId).toBe(staff.id);
  });

  test("says plainly that photo files aren't in the bundle", async () => {
    const staff = await makeStaff();
    const { tenant } = await makeClient("Photo Note Co");

    const bundle = await exportTenant(staff.id, tenant.id);
    expect(bundle.notes.some((note) => note.toLowerCase().includes("photo"))).toBe(true);
  });
});

describe("Juno Logic's own Xero credentials", () => {
  test("are invisible to a roofer session", async () => {
    const { tenant } = await makeClient("No Peeking Co");

    await ownerDb.insert(schema.platformXeroConnection).values({
      xeroTenantId: "juno-logic-org",
      accessTokenEncrypted: "encrypted",
      refreshTokenEncrypted: "encrypted",
      expiresAt: new Date(Date.now() + 60_000),
    });

    // These are Juno Logic's books, not his — the policy is staff-only.
    const visible = await withRooferTenantContext(tenant.id, (tx) =>
      tx.select().from(schema.platformXeroConnection),
    );
    expect(visible).toHaveLength(0);
  });
});

describe("billing history", () => {
  test("a roofer can see what he's been charged", async () => {
    const { tenant } = await makeClient("Sees His Bills Co");
    await runBilling(THIS_MONTH);

    const visible = await withRooferTenantContext(tenant.id, (tx) => tx.select().from(schema.platformInvoices));

    // Deliberately readable by him: he should be able to check a bill
    // without asking Juno Logic for it.
    expect(visible).toHaveLength(1);
    expect(visible[0].tenantId).toBe(tenant.id);
  });

  test("but not another roofer's", async () => {
    const mine = await makeClient("Bills Mine");
    await makeClient("Bills Theirs");
    await runBilling(THIS_MONTH);

    const visible = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.platformInvoices));
    expect(visible).toHaveLength(1);
    expect(visible[0].tenantId).toBe(mine.tenant.id);
  });
});
