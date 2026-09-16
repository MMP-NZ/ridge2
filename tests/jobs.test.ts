import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { createQuoteForVisit, replaceQuoteLines, sendQuote } from "@/lib/quotes/quotes";
import { acceptQuote } from "@/lib/quotes/accept";
import { captureVisit } from "@/lib/visits/capture";
import {
  scheduleJob,
  completeJob,
  listReadyToSchedule,
  listScheduled,
  takenWorkDates,
  addJobPhoto,
  listJobPhotos,
  getJobSummary,
} from "@/lib/scheduling/jobs";
import { handleSendJobConfirmation, handleSendJobMoved, handleSendJobReminder } from "@/lib/jobs/handlers";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

let photoDir: string;

beforeEach(async () => {
  await truncateAllTables();
  photoDir = await mkdtemp(path.join(tmpdir(), "ridge-job-photos-"));
  process.env.PHOTO_STORE_DIR = photoDir;
});

afterAll(async () => {
  delete process.env.PHOTO_STORE_DIR;
  await rm(photoDir, { recursive: true, force: true });
  await ownerSql.end();
});

/** A tenant with an accepted quote — i.e. a job sitting in ready_to_schedule. */
async function makeAcceptedJob(businessName: string, estimatedDays = 2) {
  const tenant = await makeTenant(ownerDb, businessName);

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, {
      name: "Job Customer",
      email: "job@example.com",
      phone: "+64211234567",
    });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "5 Job Street");
    return createLead(
      tx,
      tenant.id,
      { customerId: customer.id, propertyId: property.id, source: "juno_website" },
      { type: "system" },
    );
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

  await withRooferTenantContext(tenant.id, (tx) =>
    captureVisit(tx, tenant.id, visit.id, { clientCaptureId: crypto.randomUUID(), areaM2: 120 }, { type: "roofer" }),
  );

  const job = await withRooferTenantContext(tenant.id, async (tx) => {
    const draft = await createQuoteForVisit(tx, tenant.id, visit.id);
    await tx.update(schema.quotes).set({ estimatedDays }).where(eq(schema.quotes.id, draft.id));
    await replaceQuoteLines(tx, tenant.id, draft.id, [
      { description: "Re-roofing", kind: "per_m2", quantityThousandths: 120_000, unitPriceCents: 18_500 },
    ]);
    await sendQuote(tx, tenant.id, draft.id, { type: "roofer" });
    const result = await acceptQuote(tx, tenant.id, draft.id, { acceptedName: "Job Customer" });
    if (result.status !== "accepted") throw new Error("expected acceptance");
    return result.job;
  });

  return { tenant, job };
}

describe("work won but not yet booked in", () => {
  test("shows in ready-to-schedule, carrying the estimate from the quote", async () => {
    const { tenant, job } = await makeAcceptedJob("Ready Co", 3);

    const ready = await withRooferTenantContext(tenant.id, (tx) => listReadyToSchedule(tx, tenant.id));

    expect(ready).toHaveLength(1);
    expect(ready[0].job.id).toBe(job.id);
    expect(ready[0].job.estimatedDays).toBe(3);
    expect(ready[0].customerName).toBe("Job Customer");
    expect(ready[0].totalIncGstCents).toBe(2_553_000); // 120 m² × $185 + GST
    expect(ready[0].days).toEqual([]);
  });

  test("leaves ready-to-schedule once it's booked in", async () => {
    const { tenant, job } = await makeAcceptedJob("Books Co");

    await withRooferTenantContext(tenant.id, (tx) =>
      scheduleJob(tx, tenant.id, job.id, ["2026-10-12", "2026-10-14"]),
    );

    expect(await withRooferTenantContext(tenant.id, (tx) => listReadyToSchedule(tx, tenant.id))).toHaveLength(0);
    const scheduled = await withRooferTenantContext(tenant.id, (tx) => listScheduled(tx, tenant.id));
    expect(scheduled[0].days).toEqual(["2026-10-12", "2026-10-14"]);
  });
});

describe("booking and moving a job", () => {
  test("a first booking reports 'booked' and stores the days", async () => {
    const { tenant, job } = await makeAcceptedJob("First Booking Co");

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      scheduleJob(tx, tenant.id, job.id, ["2026-10-14", "2026-10-12"]),
    );

    expect(result.outcome).toBe("booked");
    expect(result.job.status).toBe("scheduled");
    // Stored in order regardless of the order they came in.
    expect(result.days).toEqual(["2026-10-12", "2026-10-14"]);
  });

  test("moving it reports 'moved' and replaces the days rather than adding to them", async () => {
    const { tenant, job } = await makeAcceptedJob("Move Co");

    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12", "2026-10-14"]));
    const moved = await withRooferTenantContext(tenant.id, (tx) =>
      scheduleJob(tx, tenant.id, job.id, ["2026-10-19", "2026-10-21"]),
    );

    expect(moved.outcome).toBe("moved");
    expect(moved.days).toEqual(["2026-10-19", "2026-10-21"]);

    const stored = await ownerDb.select().from(schema.jobDays).where(eq(schema.jobDays.jobId, job.id));
    expect(stored).toHaveLength(2);
    expect(stored.map((d) => d.workDate).sort()).toEqual(["2026-10-19", "2026-10-21"]);
  });

  test("re-confirming the same days is 'unchanged', so the customer isn't told twice", async () => {
    const { tenant, job } = await makeAcceptedJob("Same Days Co");

    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12", "2026-10-14"]));
    const again = await withRooferTenantContext(tenant.id, (tx) =>
      scheduleJob(tx, tenant.id, job.id, ["2026-10-14", "2026-10-12"]),
    );

    expect(again.outcome).toBe("unchanged");
  });

  test("a finished job can't be rescheduled", async () => {
    const { tenant, job } = await makeAcceptedJob("Finished Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));
    await withRooferTenantContext(tenant.id, (tx) => completeJob(tx, tenant.id, job.id));

    await expect(
      withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-19"])),
    ).rejects.toThrow(/done/i);
  });

  test("takenWorkDates reports the days holding work, for the suggester to step around", async () => {
    const { tenant, job } = await makeAcceptedJob("Taken Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12", "2026-10-14"]));

    const taken = await withRooferTenantContext(tenant.id, (tx) => takenWorkDates(tx, tenant.id, "2026-10-01"));
    expect(taken.sort()).toEqual(["2026-10-12", "2026-10-14"]);

    // Days before the cutoff are none of the suggester's business.
    expect(await withRooferTenantContext(tenant.id, (tx) => takenWorkDates(tx, tenant.id, "2026-10-13"))).toEqual([
      "2026-10-14",
    ]);
  });
});

describe("telling the customer", () => {
  async function messagesOfType(templateKey: string) {
    return ownerDb.select().from(schema.messages).where(eq(schema.messages.templateKey, templateKey));
  }

  test("a first booking sends a confirmation and no move notice", async () => {
    const { tenant, job } = await makeAcceptedJob("Confirm Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12", "2026-10-14"]));

    await handleSendJobConfirmation({ tenantId: tenant.id, jobId: job.id, forDate: "2026-10-12" });

    const confirmations = await messagesOfType("job_confirmation");
    expect(confirmations.length).toBeGreaterThan(0);
    expect(confirmations[0].body).toContain("12 Oct");
    expect(confirmations[0].body).toContain("14 Oct");
    expect(await messagesOfType("job_moved")).toHaveLength(0);
  });

  /** Build-plan M5 done-when: "Moving a job notifies the customer once, with the new dates". */
  test("moving it notifies once, carrying the new dates and not the old", async () => {
    const { tenant, job } = await makeAcceptedJob("Moved Once Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-19"]));

    await handleSendJobMoved({ tenantId: tenant.id, jobId: job.id, forDate: "2026-10-19" });

    const moved = await messagesOfType("job_moved");
    // One per channel the customer has — this fixture has phone and email.
    expect(moved).toHaveLength(2);
    for (const message of moved) {
      expect(message.body).toContain("19 Oct");
      expect(message.body).not.toContain("12 Oct");
    }
  });

  test("the day-before reminder goes out for the day it was queued for", async () => {
    const { tenant, job } = await makeAcceptedJob("Reminder Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));

    await handleSendJobReminder({ tenantId: tenant.id, jobId: job.id, forDate: "2026-10-12" });

    expect((await messagesOfType("job_reminder")).length).toBeGreaterThan(0);
  });

  test("a stale reminder goes quiet once the job has moved off that day", async () => {
    const { tenant, job } = await makeAcceptedJob("Stale Reminder Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-19"]));

    // The reminder queued for the original day is still out there — nothing
    // in this codebase cancels a queued job, so it has to no-op itself.
    await handleSendJobReminder({ tenantId: tenant.id, jobId: job.id, forDate: "2026-10-12" });

    expect(await messagesOfType("job_reminder")).toHaveLength(0);
  });

  test("and goes quiet once the job is finished", async () => {
    const { tenant, job } = await makeAcceptedJob("Done Reminder Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));
    await withRooferTenantContext(tenant.id, (tx) => completeJob(tx, tenant.id, job.id));

    await handleSendJobReminder({ tenantId: tenant.id, jobId: job.id, forDate: "2026-10-12" });

    expect(await messagesOfType("job_reminder")).toHaveLength(0);
  });
});

describe("finishing the job", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 2]);

  test("marking it done records when, and the notes", async () => {
    const { tenant, job } = await makeAcceptedJob("Complete Co");
    await withRooferTenantContext(tenant.id, (tx) => scheduleJob(tx, tenant.id, job.id, ["2026-10-12"]));

    const done = await withRooferTenantContext(tenant.id, (tx) =>
      completeJob(tx, tenant.id, job.id, "Replaced two sheets of flashing while we were up there."),
    );

    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();
    expect(done.completionNotes).toContain("flashing");
  });

  test("completion photos store and de-duplicate on retry", async () => {
    const { tenant, job } = await makeAcceptedJob("Job Photo Co");
    const input = { clientPhotoId: crypto.randomUUID(), bytes, contentType: "image/jpeg" };

    const photo = await withRooferTenantContext(tenant.id, (tx) => addJobPhoto(tx, tenant.id, job.id, input));
    expect(photo).not.toBeNull();
    expect(photo!.storageKey).toContain(`tenants/${tenant.id}/jobs/${job.id}/`);

    const again = await withRooferTenantContext(tenant.id, (tx) => addJobPhoto(tx, tenant.id, job.id, input));
    expect(again).toBeNull();
    expect(await withRooferTenantContext(tenant.id, (tx) => listJobPhotos(tx, tenant.id, job.id))).toHaveLength(1);
  });
});

describe("tenant isolation on the scheduling tables", () => {
  test("a roofer sees only his own job days and photos", async () => {
    const mine = await makeAcceptedJob("Sched Mine");
    const theirs = await makeAcceptedJob("Sched Theirs");

    await withRooferTenantContext(mine.tenant.id, (tx) =>
      scheduleJob(tx, mine.tenant.id, mine.job.id, ["2026-10-12"]),
    );
    await withRooferTenantContext(theirs.tenant.id, (tx) =>
      scheduleJob(tx, theirs.tenant.id, theirs.job.id, ["2026-10-13"]),
    );
    await withRooferTenantContext(theirs.tenant.id, (tx) =>
      addJobPhoto(tx, theirs.tenant.id, theirs.job.id, {
        clientPhotoId: crypto.randomUUID(),
        bytes: new Uint8Array([1, 2]),
        contentType: "image/jpeg",
      }),
    );

    const myDays = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.jobDays));
    expect(myDays.map((d) => d.workDate)).toEqual(["2026-10-12"]);

    const myPhotos = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.jobPhotos));
    expect(myPhotos).toHaveLength(0);

    // And the other roofer's job is invisible even by id.
    expect(await withRooferTenantContext(mine.tenant.id, (tx) => getJobSummary(tx, mine.tenant.id, theirs.job.id))).toBeNull();
  });
});
