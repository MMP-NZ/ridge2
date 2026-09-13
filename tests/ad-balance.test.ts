import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { recordTopUp, recordSpend } from "@/lib/ads/balance";
import { getAdsOverview } from "@/lib/ads/queries";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
  process.env.LOG_ONLY_TRANSPORT = "true"; // never a real send in tests
});

afterAll(async () => {
  await ownerSql.end();
});

async function makeStaff(email: string) {
  const [staff] = await ownerDb
    .insert(schema.staffUsers)
    .values({ email, name: "Staffer", passwordHash: "not-a-real-hash" })
    .returning();
  return staff;
}

describe("recordTopUp / recordSpend", () => {
  test("top-ups and spend update the running balance correctly", async () => {
    const tenant = await makeTenant(ownerDb, "Balance Maths Co");
    const staff = await makeStaff("staffer@junologic.example");

    const afterTopUp = await recordTopUp(staff.id, tenant.id, 50_000); // $500
    expect(afterTopUp).toBe(50_000);

    const afterSpend = await recordSpend(staff.id, tenant.id, 12_000); // $120
    expect(afterSpend).toBe(38_000);

    const [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.balanceCents).toBe(38_000);
  });

  test("entries are audit-logged (staff-only access)", async () => {
    const tenant = await makeTenant(ownerDb, "Audited Balance Co");
    const staff = await makeStaff("staffer2@junologic.example");

    await recordTopUp(staff.id, tenant.id, 10_000, "Initial top-up");

    const auditEntries = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id));
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("ad_balance.topup");

    const ledgerEntries = await ownerDb.select().from(schema.adBalanceEntries).where(eq(schema.adBalanceEntries.tenantId, tenant.id));
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].note).toBe("Initial top-up");
    expect(ledgerEntries[0].staffUserId).toBe(staff.id);
  });

  test("spend records platform and campaign", async () => {
    const tenant = await makeTenant(ownerDb, "Platform Campaign Co");
    const staff = await makeStaff("staffer3@junologic.example");
    await recordTopUp(staff.id, tenant.id, 100_000);

    await recordSpend(staff.id, tenant.id, 5_000, { platform: "meta", campaign: "spring-campaign" });

    const [entry] = await ownerDb
      .select()
      .from(schema.adBalanceEntries)
      .where(and(eq(schema.adBalanceEntries.tenantId, tenant.id), eq(schema.adBalanceEntries.type, "spend")));
    expect(entry.platform).toBe("meta");
    expect(entry.campaign).toBe("spring-campaign");
  });
});

describe("low-balance alert", () => {
  test("fires exactly once when crossing the threshold, not on every subsequent spend", async () => {
    const tenant = await makeTenant(ownerDb, "Low Balance Co");
    const staff = await makeStaff("staffer4@junologic.example");

    await recordTopUp(staff.id, tenant.id, 30_000); // above the $200 default threshold

    await recordSpend(staff.id, tenant.id, 25_000); // balance now $50 — crosses below $200 threshold
    let [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.balanceCents).toBe(5_000);
    expect(balance.lastAlertSentAt).not.toBeNull();
    const firstAlertAt = balance.lastAlertSentAt;

    await recordSpend(staff.id, tenant.id, 1_000); // still below threshold
    [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.lastAlertSentAt?.getTime()).toBe(firstAlertAt?.getTime()); // unchanged — didn't refire
  });

  test("re-arms after a top-up brings the balance back above threshold", async () => {
    const tenant = await makeTenant(ownerDb, "Re-arm Co");
    const staff = await makeStaff("staffer5@junologic.example");

    await recordTopUp(staff.id, tenant.id, 30_000);
    await recordSpend(staff.id, tenant.id, 25_000); // crosses below, alerts

    let [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.lastAlertSentAt).not.toBeNull();

    await recordTopUp(staff.id, tenant.id, 500_000); // well back above threshold
    [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.lastAlertSentAt).toBeNull();

    await recordSpend(staff.id, tenant.id, 490_000); // crosses below again — should re-alert
    [balance] = await ownerDb.select().from(schema.adBalances).where(eq(schema.adBalances.tenantId, tenant.id));
    expect(balance.lastAlertSentAt).not.toBeNull();
  });
});

describe("getAdsOverview", () => {
  test("a tenant that's never had a top-up isn't shown as low balance", async () => {
    const tenant = await makeTenant(ownerDb, "Never Funded Co");

    const overview = await getAdsOverview(tenant.id);
    expect(overview.balanceCents).toBe(0);
    expect(overview.hasBalanceRecord).toBe(false);
    expect(overview.alertSent).toBe(false);
  });

  test("a genuinely low balance is flagged, and alertSent only true once an alert actually fired", async () => {
    const tenant = await makeTenant(ownerDb, "Genuinely Low Co");
    const staff = await makeStaff("staffer6@junologic.example");

    await recordTopUp(staff.id, tenant.id, 30_000);
    let overview = await getAdsOverview(tenant.id);
    expect(overview.hasBalanceRecord).toBe(true);
    expect(overview.balanceCents).toBe(30_000);
    expect(overview.balanceCents).toBeGreaterThan(overview.lowBalanceThresholdCents);
    expect(overview.alertSent).toBe(false);

    await recordSpend(staff.id, tenant.id, 25_000); // crosses below threshold, alert fires
    overview = await getAdsOverview(tenant.id);
    expect(overview.balanceCents).toBeLessThanOrEqual(overview.lowBalanceThresholdCents);
    expect(overview.alertSent).toBe(true);
  });
});
