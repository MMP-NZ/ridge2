import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead, advanceLeadStage } from "@/lib/crm/leads";
import { followUpScheduleFor, needsCallCutoff } from "@/lib/jobs/schedule";
import { handleNoBookingNudge4h, handleNoBookingNudge2d, handleMarkCold7d } from "@/lib/jobs/handlers";
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

describe("followUpScheduleFor (pure timing)", () => {
  test("produces the 4h / 2d / 7d deltas from build-plan M2", () => {
    const createdAt = new Date("2026-09-12T00:00:00Z");
    const schedule = followUpScheduleFor(createdAt);

    expect(schedule.nudge4h.getTime() - createdAt.getTime()).toBe(4 * 60 * 60 * 1000);
    expect(schedule.nudge2d.getTime() - createdAt.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
    expect(schedule.markCold7d.getTime() - createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("needsCallCutoff", () => {
  test("is exactly 2 days before now", () => {
    const now = new Date("2026-09-12T00:00:00Z");
    expect(now.getTime() - needsCallCutoff(now).getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

async function makeLead(tenantId: string) {
  return withRooferTenantContext(tenantId, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenantId, { name: "Nudge Me", email: "nudgeme@example.com" });
    const property = await findOrCreateProperty(tx, tenantId, customer.id, "1 Nudge St");
    return createLead(tx, tenantId, { customerId: customer.id, propertyId: property.id, source: "roofer_own" }, { type: "roofer" });
  });
}

describe("no-booking nudge handlers stop as soon as a lead books", () => {
  test("handleNoBookingNudge4h sends when the lead is still new", async () => {
    const tenant = await makeTenant(ownerDb, "Nudge Sends Co");
    const lead = await makeLead(tenant.id);

    await handleNoBookingNudge4h({ tenantId: tenant.id, leadId: lead.id });

    const sent = await ownerDb
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.tenantId, tenant.id), eq(schema.messages.templateKey, "no_booking_nudge_4h")));
    expect(sent).toHaveLength(1);
    expect(sent[0].status).toBe("sent");
  });

  test("handleNoBookingNudge4h is a no-op once the lead has booked", async () => {
    const tenant = await makeTenant(ownerDb, "Nudge Skips Co");
    const lead = await makeLead(tenant.id);
    await withRooferTenantContext(tenant.id, (tx) => advanceLeadStage(tx, tenant.id, lead.id, { type: "roofer" }));

    await handleNoBookingNudge4h({ tenantId: tenant.id, leadId: lead.id });

    const sent = await ownerDb
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.tenantId, tenant.id), eq(schema.messages.templateKey, "no_booking_nudge_4h")));
    expect(sent).toHaveLength(0);
  });

  test("handleNoBookingNudge2d is also skipped once booked", async () => {
    const tenant = await makeTenant(ownerDb, "Nudge2d Skips Co");
    const lead = await makeLead(tenant.id);
    await withRooferTenantContext(tenant.id, (tx) => advanceLeadStage(tx, tenant.id, lead.id, { type: "roofer" }));

    await handleNoBookingNudge2d({ tenantId: tenant.id, leadId: lead.id });

    const sent = await ownerDb
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.tenantId, tenant.id), eq(schema.messages.templateKey, "no_booking_nudge_2d")));
    expect(sent).toHaveLength(0);
  });

  test("handleMarkCold7d closes a still-new lead as lost", async () => {
    const tenant = await makeTenant(ownerDb, "Mark Cold Co");
    const lead = await makeLead(tenant.id);

    await handleMarkCold7d({ tenantId: tenant.id, leadId: lead.id });

    const [updated] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updated.stage).toBe("lost");
  });

  test("handleMarkCold7d does nothing once the lead has booked", async () => {
    const tenant = await makeTenant(ownerDb, "Mark Cold Skips Co");
    const lead = await makeLead(tenant.id);
    await withRooferTenantContext(tenant.id, (tx) => advanceLeadStage(tx, tenant.id, lead.id, { type: "roofer" }));

    await handleMarkCold7d({ tenantId: tenant.id, leadId: lead.id });

    const [updated] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updated.stage).toBe("booked");
  });
});
