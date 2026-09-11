import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { sendTransactional, sendCommercial } from "@/lib/messaging/send";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

async function makeCustomer(tenantId: string, commercialConsent = false) {
  const [customer] = await ownerDb
    .insert(schema.customers)
    .values({ tenantId, name: "Msg Customer", email: "msg@example.com", commercialConsent })
    .returning();
  return customer;
}

describe("sendTransactional", () => {
  test("always sends — booking links, confirmations, reminders and nudges need no consent", async () => {
    const tenant = await makeTenant(ownerDb, "Transactional Co");
    const customer = await makeCustomer(tenant.id, false);

    await withRooferTenantContext(tenant.id, (tx) =>
      sendTransactional(tx, {
        tenantId: tenant.id,
        customerId: customer.id,
        channel: "email",
        to: customer.email!,
        templateKey: "visit_confirmation",
        subject: "Confirmed",
        body: "Your visit is confirmed",
      }),
    );

    const rows = await ownerDb.select().from(schema.messages).where(eq(schema.messages.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].direction).toBe("outbound");
  });
});

describe("sendCommercial", () => {
  test("blocks and logs (not sends) when the customer hasn't consented", async () => {
    const tenant = await makeTenant(ownerDb, "No Consent Co");
    const customer = await makeCustomer(tenant.id, false);

    await withRooferTenantContext(tenant.id, (tx) =>
      sendCommercial(
        tx,
        {
          tenantId: tenant.id,
          customerId: customer.id,
          channel: "email",
          to: customer.email!,
          templateKey: "review_request",
          subject: "Rate us",
          body: "Please leave a review",
        },
        false,
      ),
    );

    const rows = await ownerDb.select().from(schema.messages).where(eq(schema.messages.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("blocked");
    expect(rows[0].providerMessageId).toBeNull();
  });

  test("sends when the customer has consented", async () => {
    const tenant = await makeTenant(ownerDb, "Consent Co");
    const customer = await makeCustomer(tenant.id, true);

    await withRooferTenantContext(tenant.id, (tx) =>
      sendCommercial(
        tx,
        {
          tenantId: tenant.id,
          customerId: customer.id,
          channel: "email",
          to: customer.email!,
          templateKey: "review_request",
          subject: "Rate us",
          body: "Please leave a review",
        },
        true,
      ),
    );

    const rows = await ownerDb.select().from(schema.messages).where(eq(schema.messages.tenantId, tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
  });
});
