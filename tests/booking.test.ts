import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { generateOpenSlots } from "@/lib/booking/slots";
import { bookVisit } from "@/lib/booking/book";
import { nzLocalToUtc } from "@/lib/time";
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

async function setUpTenantWithLead(businessName: string) {
  const tenant = await makeTenant(ownerDb, businessName);
  await ownerDb.insert(schema.calendarRules).values({
    tenantId: tenant.id,
    quoteDaysOfWeek: [2, 4], // Tue, Thu
    quoteHoursStartMin: 480,
    quoteHoursEndMin: 960,
    visitLengthMinutes: 45,
    travelBufferMinutes: 15,
  });

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, { name: "Book Me", email: "bookme@example.com" });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "1 Test St");
    return createLead(tx, tenant.id, { customerId: customer.id, propertyId: property.id, source: "roofer_own" }, { type: "roofer" });
  });

  return { tenant, lead };
}

/** The next open slot, computed the same way the real booking page would. */
async function firstOpenSlot(tenantId: string, propertyAddress: string): Promise<Date> {
  const [rules] = await ownerDb.select().from(schema.calendarRules).where(eq(schema.calendarRules.tenantId, tenantId));
  const now = new Date();
  const to = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  const { slots } = generateOpenSlots(rules, [], propertyAddress, now, to, now);
  return slots[0];
}

describe("bookVisit", () => {
  test("books an open slot and advances the lead to booked", async () => {
    const { tenant, lead } = await setUpTenantWithLead("Book Success Co");
    const slot = await firstOpenSlot(tenant.id, "1 Test St");

    const result = await bookVisit(tenant.id, lead.id, slot);
    expect(result.status).toBe("booked");

    const [updatedLead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe("booked");

    const visitRows = await ownerDb.select().from(schema.visits).where(eq(schema.visits.tenantId, tenant.id));
    expect(visitRows).toHaveLength(1);
    expect(visitRows[0].startAt.getTime()).toBe(slot.getTime());
  });

  test("rejects a time that isn't a currently-open slot", async () => {
    const { tenant, lead } = await setUpTenantWithLead("Bad Slot Co");
    const notASlot = nzLocalToUtc(2026, 9, 22, 8, 17); // not grid-aligned

    const result = await bookVisit(tenant.id, lead.id, notASlot);
    expect(result.status).toBe("not_open");

    const visitRows = await ownerDb.select().from(schema.visits).where(eq(schema.visits.tenantId, tenant.id));
    expect(visitRows).toHaveLength(0);
  });

  test("refuses to double-book a lead that's already booked", async () => {
    const { tenant, lead } = await setUpTenantWithLead("Already Booked Co");
    const slot = await firstOpenSlot(tenant.id, "1 Test St");
    await bookVisit(tenant.id, lead.id, slot);

    const nextSlot = new Date(slot.getTime() + 60 * 60 * 1000);
    const result = await bookVisit(tenant.id, lead.id, nextSlot);
    expect(result.status).toBe("not_open");
  });

  test("concurrent bookings for the same slot: one wins, one is told it's taken, only one visit exists", async () => {
    const tenant = await makeTenant(ownerDb, "Concurrency Co");
    await ownerDb.insert(schema.calendarRules).values({
      tenantId: tenant.id,
      quoteDaysOfWeek: [2, 4],
      quoteHoursStartMin: 480,
      quoteHoursEndMin: 960,
      visitLengthMinutes: 45,
      travelBufferMinutes: 15,
    });

    // Two different customers/leads racing for the same slot.
    const [leadA, leadB] = await withRooferTenantContext(tenant.id, async (tx) => {
      const customerA = await findOrCreateCustomer(tx, tenant.id, { name: "Racer A", email: "a@example.com" });
      const propertyA = await findOrCreateProperty(tx, tenant.id, customerA.id, "1 Race St");
      const a = await createLead(tx, tenant.id, { customerId: customerA.id, propertyId: propertyA.id, source: "roofer_own" }, { type: "roofer" });

      const customerB = await findOrCreateCustomer(tx, tenant.id, { name: "Racer B", email: "b@example.com" });
      const propertyB = await findOrCreateProperty(tx, tenant.id, customerB.id, "2 Race St");
      const b = await createLead(tx, tenant.id, { customerId: customerB.id, propertyId: propertyB.id, source: "roofer_own" }, { type: "roofer" });

      return [a, b];
    });

    const slot = await firstOpenSlot(tenant.id, "1 Race St");

    const [resultA, resultB] = await Promise.all([bookVisit(tenant.id, leadA.id, slot), bookVisit(tenant.id, leadB.id, slot)]);

    // Exactly one booking wins. The loser's exact reason depends on how the
    // two transactions happen to interleave: if it loses the race at
    // INSERT time it gets "slot_taken" (the unique constraint firing); if
    // the winner had already committed by the time the loser re-derived
    // open slots, it correctly sees the slot as no-longer-open and returns
    // "not_open" instead. Both are a safe rejection — what matters is that
    // only one booking ever succeeds.
    const statuses = [resultA.status, resultB.status];
    expect(statuses).toContain("booked");
    expect(statuses.filter((s) => s === "booked")).toHaveLength(1);
    for (const status of statuses) {
      expect(["booked", "slot_taken", "not_open"]).toContain(status);
    }

    const visitRows = await ownerDb.select().from(schema.visits).where(eq(schema.visits.tenantId, tenant.id));
    expect(visitRows).toHaveLength(1);
  });
});
