import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { captureVisit } from "@/lib/visits/capture";
import { addVisitPhoto, listVisitPhotos } from "@/lib/visits/photos";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

let photoDir: string;

beforeEach(async () => {
  await truncateAllTables();
  photoDir = await mkdtemp(path.join(tmpdir(), "ridge-capture-photos-"));
  process.env.PHOTO_STORE_DIR = photoDir;
});

afterAll(async () => {
  delete process.env.PHOTO_STORE_DIR;
  await rm(photoDir, { recursive: true, force: true });
  await ownerSql.end();
});

/** A tenant with a booked visit, the state the roofer arrives on site in. */
async function makeBookedVisit(businessName: string) {
  const tenant = await makeTenant(ownerDb, businessName);

  const { lead, propertyId } = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, { name: "Site Owner", email: "site@example.com" });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "22 Roof Road");
    const lead = await createLead(
      tx,
      tenant.id,
      { customerId: customer.id, propertyId: property.id, source: "juno_website" },
      { type: "system" },
    );
    return { lead, propertyId: property.id };
  });

  const [visit] = await ownerDb
    .insert(schema.visits)
    .values({
      tenantId: tenant.id,
      leadId: lead.id,
      startAt: new Date("2026-10-06T21:00:00Z"),
      endAt: new Date("2026-10-06T21:45:00Z"),
    })
    .returning();

  return { tenant, lead, propertyId, visit };
}

const CAPTURE = {
  clientCaptureId: "11111111-1111-4111-8111-111111111111",
  roofType: "Gable",
  material: "Corrugated steel",
  pitchDegrees: 25,
  areaM2: 148.5,
  condition: "fair" as const,
  siteNotes: "Rust around the flashing on the north face.",
};

describe("capturing a site visit", () => {
  test("records the measurements, closes the visit and moves the lead to visited", async () => {
    const { tenant, lead, propertyId, visit } = await makeBookedVisit("Capture Co");

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      captureVisit(tx, tenant.id, visit.id, CAPTURE, { type: "roofer" }),
    );

    expect(result.applied).toBe(true);
    expect(result.visit.status).toBe("completed");
    expect(result.visit.areaM2).toBeCloseTo(148.5);
    expect(result.visit.condition).toBe("fair");
    expect(result.visit.capturedAt).not.toBeNull();

    const [updatedLead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe("visited");

    // The roof details belong to the property too — the next job at this
    // address should start from what he measured this time.
    const [property] = await ownerDb.select().from(schema.properties).where(eq(schema.properties.id, propertyId));
    expect(property.roofType).toBe("Gable");
    expect(property.material).toBe("Corrugated steel");
    expect(property.areaM2).toBeCloseTo(148.5);
  });

  test("a replayed offline sync changes nothing and logs no second event", async () => {
    const { tenant, lead, visit } = await makeBookedVisit("Replay Co");

    await withRooferTenantContext(tenant.id, (tx) => captureVisit(tx, tenant.id, visit.id, CAPTURE, { type: "roofer" }));

    // The same capture arriving again: the request was retried, or the app
    // was reopened mid-flush. Same clientCaptureId, different measurements
    // in the payload — none of it should land.
    const second = await withRooferTenantContext(tenant.id, (tx) =>
      captureVisit(tx, tenant.id, visit.id, { ...CAPTURE, areaM2: 999, siteNotes: "should not overwrite" }, { type: "roofer" }),
    );

    expect(second.applied).toBe(false);
    expect(second.visit.areaM2).toBeCloseTo(148.5);
    expect(second.visit.siteNotes).toBe(CAPTURE.siteNotes);

    const events = await ownerDb
      .select()
      .from(schema.leadEvents)
      .where(and(eq(schema.leadEvents.leadId, lead.id), eq(schema.leadEvents.type, "stage_changed")));
    expect(events).toHaveLength(1);
  });

  test("a later capture with a new id updates the visit, for a genuine correction", async () => {
    const { tenant, visit } = await makeBookedVisit("Correction Co");

    await withRooferTenantContext(tenant.id, (tx) => captureVisit(tx, tenant.id, visit.id, CAPTURE, { type: "roofer" }));
    const corrected = await withRooferTenantContext(tenant.id, (tx) =>
      captureVisit(
        tx,
        tenant.id,
        visit.id,
        { ...CAPTURE, clientCaptureId: "22222222-2222-4222-8222-222222222222", areaM2: 151 },
        { type: "roofer" },
      ),
    );

    expect(corrected.applied).toBe(true);
    expect(corrected.visit.areaM2).toBeCloseTo(151);
  });

  test("a roofer can't capture against another roofer's visit", async () => {
    const mine = await makeBookedVisit("Capture Mine");
    const theirs = await makeBookedVisit("Capture Theirs");

    await expect(
      withRooferTenantContext(mine.tenant.id, (tx) =>
        captureVisit(tx, mine.tenant.id, theirs.visit.id, CAPTURE, { type: "roofer" }),
      ),
    ).rejects.toThrow(/not found/i);

    const [untouched] = await ownerDb.select().from(schema.visits).where(eq(schema.visits.id, theirs.visit.id));
    expect(untouched.status).toBe("scheduled");
    expect(untouched.capturedAt).toBeNull();
  });
});

describe("site photos", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7]);

  test("stores the bytes and records the photo against the visit", async () => {
    const { tenant, visit } = await makeBookedVisit("Photo Co");

    const photo = await withRooferTenantContext(tenant.id, (tx) =>
      addVisitPhoto(tx, tenant.id, visit.id, {
        clientPhotoId: "33333333-3333-4333-8333-333333333333",
        bytes,
        contentType: "image/jpeg",
        caption: "North face",
      }),
    );

    expect(photo).not.toBeNull();
    expect(photo!.byteSize).toBe(bytes.byteLength);
    expect(photo!.storageKey).toContain(`tenants/${tenant.id}/visits/${visit.id}/`);
    expect(photo!.includeInQuote).toBe(true);
  });

  test("re-uploading the same photo after a dropped connection doesn't duplicate it", async () => {
    const { tenant, visit } = await makeBookedVisit("Photo Retry Co");
    const input = {
      clientPhotoId: "44444444-4444-4444-8444-444444444444",
      bytes,
      contentType: "image/jpeg",
    };

    await withRooferTenantContext(tenant.id, (tx) => addVisitPhoto(tx, tenant.id, visit.id, input));
    const again = await withRooferTenantContext(tenant.id, (tx) => addVisitPhoto(tx, tenant.id, visit.id, input));

    expect(again).toBeNull();
    const photos = await withRooferTenantContext(tenant.id, (tx) => listVisitPhotos(tx, tenant.id, visit.id));
    expect(photos).toHaveLength(1);
  });

  test("two roofers can use the same client photo id without colliding", async () => {
    const mine = await makeBookedVisit("Photo Mine");
    const theirs = await makeBookedVisit("Photo Theirs");
    const clientPhotoId = "55555555-5555-4555-8555-555555555555";

    await withRooferTenantContext(mine.tenant.id, (tx) =>
      addVisitPhoto(tx, mine.tenant.id, mine.visit.id, { clientPhotoId, bytes, contentType: "image/jpeg" }),
    );
    const theirPhoto = await withRooferTenantContext(theirs.tenant.id, (tx) =>
      addVisitPhoto(tx, theirs.tenant.id, theirs.visit.id, { clientPhotoId, bytes, contentType: "image/jpeg" }),
    );

    // The uniqueness is per tenant, and the storage keys are namespaced by
    // tenant, so one roofer's photo can never overwrite another's.
    expect(theirPhoto).not.toBeNull();
    expect(theirPhoto!.storageKey).not.toBe(
      (await withRooferTenantContext(mine.tenant.id, (tx) => listVisitPhotos(tx, mine.tenant.id, mine.visit.id)))[0]
        .storageKey,
    );
  });
});
