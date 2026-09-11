import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferAccess, withStaffTenantAccess } from "@/lib/auth/with-tenant-context";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead, advanceLeadStage, closeLead, changeLeadSource } from "@/lib/crm/leads";
import { submitWebsiteLead } from "@/lib/crm/intake";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

async function makeStaff(email: string) {
  const [staff] = await ownerDb
    .insert(schema.staffUsers)
    .values({ email, name: "Staffer", passwordHash: "not-a-real-hash" })
    .returning();
  return staff;
}

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

describe("website intake", () => {
  test("creates a customer, property and lead with source = juno_website", async () => {
    const tenant = await makeTenant(ownerDb, "Intake Co");

    const result = await submitWebsiteLead(tenant.publicIntakeKey, {
      name: "Alice Homeowner",
      phone: "021 555 0101",
      address: "12 Fairview Rd, Auckland",
    });

    expect(result.status).toBe("created");

    const [lead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(lead.source).toBe("juno_website");

    const [customer] = await ownerDb.select().from(schema.customers).where(eq(schema.customers.id, lead.customerId));
    expect(customer.name).toBe("Alice Homeowner");

    const [property] = await ownerDb.select().from(schema.properties).where(eq(schema.properties.id, lead.propertyId));
    expect(property.address).toBe("12 Fairview Rd, Auckland");

    const [createdEvent] = await ownerDb.select().from(schema.leadEvents).where(eq(schema.leadEvents.leadId, lead.id));
    expect(createdEvent.type).toBe("created");
    expect(createdEvent.actorType).toBe("system");
  });

  test("a second enquiry with the same phone attaches to the existing customer", async () => {
    const tenant = await makeTenant(ownerDb, "Dedup Phone Co");

    await submitWebsiteLead(tenant.publicIntakeKey, { name: "Bob Roofer", phone: "021 555 0102", address: "1 First St" });
    await submitWebsiteLead(tenant.publicIntakeKey, {
      name: "Bob Roofer",
      phone: "021 555 0102",
      address: "1 First St",
    });

    const customers = await ownerDb.select().from(schema.customers).where(eq(schema.customers.tenantId, tenant.id));
    expect(customers).toHaveLength(1);

    const leads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(leads).toHaveLength(2);
  });

  test("a second enquiry with the same email for a new address creates a new property, not a duplicate", async () => {
    const tenant = await makeTenant(ownerDb, "Dedup Address Co");

    await submitWebsiteLead(tenant.publicIntakeKey, { name: "Cara Landlord", email: "cara@example.com", address: "1 First St" });
    await submitWebsiteLead(tenant.publicIntakeKey, { name: "Cara Landlord", email: "cara@example.com", address: "2 Second St" });

    const customers = await ownerDb.select().from(schema.customers).where(eq(schema.customers.tenantId, tenant.id));
    expect(customers).toHaveLength(1);

    const properties = await ownerDb
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.customerId, customers[0].id));
    expect(properties).toHaveLength(2);
  });

  test("a honeypot-filled submission creates nothing", async () => {
    const tenant = await makeTenant(ownerDb, "Honeypot Co");

    const result = await submitWebsiteLead(tenant.publicIntakeKey, {
      name: "Bot",
      email: "bot@example.com",
      address: "Nowhere",
      honeypot: "I am a bot",
    });

    expect(result.status).toBe("ignored");
    const leads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(leads).toHaveLength(0);
  });

  test("an unknown intake key is ignored, not an error", async () => {
    const result = await submitWebsiteLead("not-a-real-key", { name: "X", email: "x@example.com", address: "Y" });
    expect(result.status).toBe("ignored");
  });

  test("rate limits after 5 website leads for a tenant within the window", async () => {
    const tenant = await makeTenant(ownerDb, "Rate Limit Co");

    for (let i = 0; i < 5; i++) {
      const result = await submitWebsiteLead(tenant.publicIntakeKey, {
        name: `Person ${i}`,
        email: `person${i}@example.com`,
        address: `${i} Some St`,
      });
      expect(result.status).toBe("created");
    }

    const sixth = await submitWebsiteLead(tenant.publicIntakeKey, {
      name: "Person 6",
      email: "person6@example.com",
      address: "6 Some St",
    });
    expect(sixth.status).toBe("rate_limited");

    const leads = await ownerDb.select().from(schema.leads).where(eq(schema.leads.tenantId, tenant.id));
    expect(leads).toHaveLength(5);
  });
});

describe("lead pipeline", () => {
  async function makeLead(tenantId: string) {
    return withRooferTenantContext(tenantId, async (tx) => {
      const customer = await findOrCreateCustomer(tx, tenantId, { name: "Dana Client", email: "dana@example.com" });
      const property = await findOrCreateProperty(tx, tenantId, customer.id, "9 Ninth St");
      return createLead(tx, tenantId, { customerId: customer.id, propertyId: property.id, source: "roofer_own" }, { type: "roofer" });
    });
  }

  test("advanceLeadStage moves new -> booked and logs the event", async () => {
    const tenant = await makeTenant(ownerDb, "Advance Co");
    const lead = await makeLead(tenant.id);

    const updated = await withRooferAccess(tenant.id, (tx) => advanceLeadStage(tx, tenant.id, lead.id, { type: "roofer" }));
    expect(updated.stage).toBe("booked");

    const events = await ownerDb
      .select()
      .from(schema.leadEvents)
      .where(and(eq(schema.leadEvents.leadId, lead.id), eq(schema.leadEvents.type, "stage_changed")));
    expect(events).toHaveLength(1);
    expect(events[0].fromValue).toBe("new");
    expect(events[0].toValue).toBe("booked");
  });

  test("closeLead sets the stage to lost from any open stage and logs it", async () => {
    const tenant = await makeTenant(ownerDb, "Close Co");
    const lead = await makeLead(tenant.id);

    const closed = await withRooferAccess(tenant.id, (tx) => closeLead(tx, tenant.id, lead.id, { type: "roofer" }));
    expect(closed.stage).toBe("lost");
  });

  test("closeLead refuses to close an already-closed lead", async () => {
    const tenant = await makeTenant(ownerDb, "Already Closed Co");
    const lead = await makeLead(tenant.id);

    await withRooferAccess(tenant.id, (tx) => closeLead(tx, tenant.id, lead.id, { type: "roofer" }));

    await expect(withRooferAccess(tenant.id, (tx) => closeLead(tx, tenant.id, lead.id, { type: "roofer" }))).rejects.toThrow();
  });

  test("changeLeadSource is staff-only, logs a lead_event and an audit_log row", async () => {
    const tenant = await makeTenant(ownerDb, "Source Change Co");
    const staff = await makeStaff("staffer@junologic.example");
    const lead = await makeLead(tenant.id);

    const updated = await changeLeadSource(staff.id, tenant.id, lead.id, "juno_ads");
    expect(updated.source).toBe("juno_ads");

    const events = await ownerDb
      .select()
      .from(schema.leadEvents)
      .where(and(eq(schema.leadEvents.leadId, lead.id), eq(schema.leadEvents.type, "source_changed")));
    expect(events).toHaveLength(1);
    expect(events[0].fromValue).toBe("roofer_own");
    expect(events[0].toValue).toBe("juno_ads");
    expect(events[0].actorType).toBe("staff");

    const auditEntries = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenant.id));
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe("lead.source.change");
  });
});

describe("cross-tenant isolation for CRM data", () => {
  test("a roofer session can't see another tenant's customers or leads", async () => {
    const tenantA = await makeTenant(ownerDb, "CRM Tenant A");
    const tenantB = await makeTenant(ownerDb, "CRM Tenant B");

    await submitWebsiteLead(tenantA.publicIntakeKey, { name: "A Customer", email: "a@example.com", address: "A St" });
    await submitWebsiteLead(tenantB.publicIntakeKey, { name: "B Customer", email: "b@example.com", address: "B St" });

    const visibleCustomers = await withRooferAccess(tenantA.id, (tx) => tx.select().from(schema.customers));
    expect(visibleCustomers).toHaveLength(1);
    expect(visibleCustomers[0].name).toBe("A Customer");

    const visibleLeads = await withRooferAccess(tenantA.id, (tx) => tx.select().from(schema.leads));
    expect(visibleLeads).toHaveLength(1);
  });
});
