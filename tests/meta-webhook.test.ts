import { describe, test, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/auth/encryption";
import { verifyMetaSignature } from "@/lib/meta/webhook-signature";
import { parseMetaLeadFields, ADDRESS_NOT_PROVIDED_PLACEHOLDER } from "@/lib/meta/parse-lead";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";
import { createHmac } from "node:crypto";

vi.mock("@/lib/meta/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/graph")>();
  return { ...actual, getLead: vi.fn() };
});

import { getLead, type MetaLeadData } from "@/lib/meta/graph";
import { processLeadgenDelivery } from "@/lib/meta/process-delivery";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
  vi.mocked(getLead).mockReset();
});

afterAll(async () => {
  await ownerSql.end();
});

async function connectPage(tenantId: string, pageId: string) {
  await ownerDb.insert(schema.metaConnections).values({
    tenantId,
    pageId,
    pageName: "Demo Roofing Co Page",
    accessTokenEncrypted: encryptSecret("fake-page-token"),
  });
}

function mockLead(fieldData: MetaLeadData["field_data"]) {
  vi.mocked(getLead).mockResolvedValue({ id: "leadgen-1", created_time: "2026-09-12T00:00:00+0000", field_data: fieldData });
}

describe("verifyMetaSignature", () => {
  test("accepts a correctly signed body", () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const body = JSON.stringify({ hello: "world" });
    const signature = "sha256=" + createHmac("sha256", "test-app-secret").update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, signature)).toBe(true);
  });

  test("rejects a tampered body", () => {
    process.env.META_APP_SECRET = "test-app-secret";
    const signature = "sha256=" + createHmac("sha256", "test-app-secret").update("original", "utf8").digest("hex");
    expect(verifyMetaSignature("tampered", signature)).toBe(false);
  });

  test("rejects a missing or malformed header", () => {
    process.env.META_APP_SECRET = "test-app-secret";
    expect(verifyMetaSignature("body", null)).toBe(false);
    expect(verifyMetaSignature("body", "not-sha256=abc")).toBe(false);
  });
});

describe("parseMetaLeadFields", () => {
  test("extracts standard fields", () => {
    const parsed = parseMetaLeadFields([
      { name: "full_name", values: ["Alice Homeowner"] },
      { name: "email", values: ["alice@example.com"] },
      { name: "phone_number", values: ["+64211234567"] },
      { name: "street_address", values: ["12 Fairview Rd"] },
    ]);
    expect(parsed).toEqual({
      name: "Alice Homeowner",
      email: "alice@example.com",
      phone: "+64211234567",
      address: "12 Fairview Rd",
    });
  });

  test("falls back to a placeholder address when none is present", () => {
    const parsed = parseMetaLeadFields([
      { name: "full_name", values: ["Bob"] },
      { name: "email", values: ["bob@example.com"] },
    ]);
    expect(parsed.address).toBe(ADDRESS_NOT_PROVIDED_PLACEHOLDER);
  });
});

describe("processLeadgenDelivery", () => {
  test("creates a customer, property and lead with source = juno_ads", async () => {
    const tenant = await makeTenant(ownerDb, "Meta Ads Co");
    await connectPage(tenant.id, "page-123");
    mockLead([
      { name: "full_name", values: ["Cara Client"] },
      { name: "phone_number", values: ["+64219998888"] },
      { name: "street_address", values: ["9 Ad Lane"] },
    ]);

    const result = await processLeadgenDelivery({ leadgen_id: "leadgen-1", page_id: "page-123", ad_id: "ad-456" });
    expect(result.status).toBe("processed");

    const [lead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(lead.source).toBe("juno_ads");
    expect(lead.campaign).toBe("ad-456");

    const [customer] = await ownerDb.select().from(schema.customers).where(eq(schema.customers.id, lead.customerId));
    expect(customer.name).toBe("Cara Client");

    const [property] = await ownerDb.select().from(schema.properties).where(eq(schema.properties.id, lead.propertyId));
    expect(property.address).toBe("9 Ad Lane");
  });

  test("a lead with no address gets the placeholder", async () => {
    const tenant = await makeTenant(ownerDb, "No Address Co");
    await connectPage(tenant.id, "page-noaddr");
    mockLead([{ name: "full_name", values: ["Dave"] }, { name: "email", values: ["dave@example.com"] }]);

    await processLeadgenDelivery({ leadgen_id: "leadgen-2", page_id: "page-noaddr" });

    const [lead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    const [property] = await ownerDb.select().from(schema.properties).where(eq(schema.properties.id, lead.propertyId));
    expect(property.address).toBe(ADDRESS_NOT_PROVIDED_PLACEHOLDER);
  });

  test("a redelivered leadgen_id does not create a second lead", async () => {
    const tenant = await makeTenant(ownerDb, "Redelivery Co");
    await connectPage(tenant.id, "page-redeliver");
    mockLead([{ name: "full_name", values: ["Eve"] }, { name: "email", values: ["eve@example.com"] }]);

    const first = await processLeadgenDelivery({ leadgen_id: "leadgen-dup", page_id: "page-redeliver" });
    expect(first.status).toBe("processed");

    const second = await processLeadgenDelivery({ leadgen_id: "leadgen-dup", page_id: "page-redeliver" });
    expect(second.status).toBe("duplicate");

    const allLeads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(allLeads).toHaveLength(1);
  });

  test("an unknown page_id is ignored", async () => {
    const result = await processLeadgenDelivery({ leadgen_id: "leadgen-unknown", page_id: "not-a-real-page" });
    expect(result.status).toBe("ignored");
  });

  test("a lead with neither phone nor email is marked failed, not crashed", async () => {
    const tenant = await makeTenant(ownerDb, "No Contact Co");
    await connectPage(tenant.id, "page-nocontact");
    mockLead([{ name: "full_name", values: ["Ghost"] }]);

    const result = await processLeadgenDelivery({ leadgen_id: "leadgen-nocontact", page_id: "page-nocontact" });
    expect(result.status).toBe("failed");

    const allLeads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(allLeads).toHaveLength(0);

    const [delivery] = await ownerDb
      .select()
      .from(schema.metaLeadDeliveries)
      .where(eq(schema.metaLeadDeliveries.leadgenId, "leadgen-nocontact"));
    expect(delivery.status).toBe("failed");
  });
});

describe("POST /api/webhooks/meta", () => {
  function signedRequest(body: string) {
    process.env.META_APP_SECRET = "test-app-secret";
    const signature = "sha256=" + createHmac("sha256", "test-app-secret").update(body, "utf8").digest("hex");
    return new NextRequest("http://localhost/api/webhooks/meta", {
      method: "POST",
      headers: { "x-hub-signature-256": signature },
      body,
    });
  }

  test("returns 500 so Meta retries when processing throws (a Graph API/infra failure, not a recognized outcome)", async () => {
    const tenant = await makeTenant(ownerDb, "Flaky Graph API Co");
    await connectPage(tenant.id, "page-flaky");
    vi.mocked(getLead).mockRejectedValue(new Error("Meta Graph API GET leadgen-flaky failed: 500 upstream error"));

    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      object: "page",
      entry: [{ id: "page-flaky", changes: [{ field: "leadgen", value: { leadgen_id: "leadgen-flaky", page_id: "page-flaky" } }] }],
    });

    const response = await POST(signedRequest(body));
    expect(response.status).toBe(500);

    const allLeads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(allLeads).toHaveLength(0);
  });

  test("returns 200 for a recognized outcome (unknown page_id)", async () => {
    const { POST } = await import("@/app/api/webhooks/meta/route");
    const body = JSON.stringify({
      object: "page",
      entry: [{ id: "not-a-real-page", changes: [{ field: "leadgen", value: { leadgen_id: "leadgen-x", page_id: "not-a-real-page" } }] }],
    });

    const response = await POST(signedRequest(body));
    expect(response.status).toBe(200);
  });
});
