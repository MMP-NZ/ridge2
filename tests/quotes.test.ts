import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { captureVisit } from "@/lib/visits/capture";
import {
  createQuoteForVisit,
  replaceQuoteLines,
  listQuoteLines,
  sendQuote,
  reviseQuote,
} from "@/lib/quotes/quotes";
import { acceptQuote, declineQuote } from "@/lib/quotes/accept";
import { getQuotePageData } from "@/lib/quotes/public-lookup";
import { quoteFollowUpScheduleFor } from "@/lib/jobs/schedule";
import { handleSendQuote, handleQuoteFollowUp3d, handleQuoteFollowUp7d } from "@/lib/jobs/handlers";
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

/** A tenant whose visit has been written up — the state a quote is built from. */
async function makeCapturedVisit(businessName: string) {
  const tenant = await makeTenant(ownerDb, businessName);

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, {
      name: "Quote Customer",
      email: "quote@example.com",
      phone: "+64211234567",
    });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "8 Quote Lane");
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
    captureVisit(
      tx,
      tenant.id,
      visit.id,
      { clientCaptureId: crypto.randomUUID(), areaM2: 148.5, roofType: "Gable" },
      { type: "roofer" },
    ),
  );

  return { tenant, lead, visit };
}

const LINES = [
  { description: "Roof painting", kind: "per_m2" as const, quantityThousandths: 12_500, unitPriceCents: 4_850 },
  { description: "Spouting replacement", kind: "per_metre" as const, quantityThousandths: 18_400, unitPriceCents: 6_200 },
];

async function makeDraftQuote(businessName: string) {
  const ctx = await makeCapturedVisit(businessName);
  const quote = await withRooferTenantContext(ctx.tenant.id, async (tx) => {
    const draft = await createQuoteForVisit(tx, ctx.tenant.id, ctx.visit.id);
    return replaceQuoteLines(tx, ctx.tenant.id, draft.id, LINES);
  });
  return { ...ctx, quote };
}

describe("building a quote", () => {
  test("stores totals computed from the lines, with GST separate", async () => {
    const { quote } = await makeDraftQuote("Build Quote Co");

    // 12.5 m² × $48.50 = $606.25, 18.4 m × $62.00 = $1,140.80
    expect(quote.subtotalExGstCents).toBe(174_705);
    expect(quote.gstCents).toBe(26_206); // 174705 × 15% = 26205.75, rounded half-up
    expect(quote.totalIncGstCents).toBe(200_911);
    expect(quote.totalIncGstCents).toBe(quote.subtotalExGstCents + quote.gstCents);
    expect(quote.status).toBe("draft");
    expect(quote.gstRateBp).toBe(1_500);
  });

  test("replacing the lines recomputes the totals", async () => {
    const { tenant, quote } = await makeDraftQuote("Recompute Co");

    const updated = await withRooferTenantContext(tenant.id, (tx) =>
      replaceQuoteLines(tx, tenant.id, quote.id, [LINES[0]]),
    );

    expect(updated.subtotalExGstCents).toBe(60_625);
    expect(await withRooferTenantContext(tenant.id, (tx) => listQuoteLines(tx, tenant.id, quote.id))).toHaveLength(1);
  });

  test("a quote with no lines can't be sent", async () => {
    const ctx = await makeCapturedVisit("Empty Quote Co");
    const draft = await withRooferTenantContext(ctx.tenant.id, (tx) => createQuoteForVisit(tx, ctx.tenant.id, ctx.visit.id));

    await expect(
      withRooferTenantContext(ctx.tenant.id, (tx) => sendQuote(tx, ctx.tenant.id, draft.id, { type: "roofer" })),
    ).rejects.toThrow(/at least one line/i);
  });
});

describe("sending a quote", () => {
  test("marks it sent and moves the lead to quoted", async () => {
    const { tenant, lead, quote } = await makeDraftQuote("Send Quote Co");

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      sendQuote(tx, tenant.id, quote.id, { type: "roofer" }),
    );

    expect(result.sent).toBe(true);
    expect(result.quote.status).toBe("sent");
    expect(result.quote.sentAt).not.toBeNull();

    const [updatedLead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe("quoted");
  });

  test("sending twice doesn't re-send or log a second stage change", async () => {
    const { tenant, lead, quote } = await makeDraftQuote("Send Twice Co");

    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));
    const second = await withRooferTenantContext(tenant.id, (tx) =>
      sendQuote(tx, tenant.id, quote.id, { type: "roofer" }),
    );

    expect(second.sent).toBe(false);

    const events = await ownerDb
      .select()
      .from(schema.leadEvents)
      .where(and(eq(schema.leadEvents.leadId, lead.id), eq(schema.leadEvents.toValue, "quoted")));
    expect(events).toHaveLength(1);
  });

  test("a sent quote can't be edited — its figures are what the customer was shown", async () => {
    const { tenant, quote } = await makeDraftQuote("Frozen Quote Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    await expect(
      withRooferTenantContext(tenant.id, (tx) => replaceQuoteLines(tx, tenant.id, quote.id, [LINES[0]])),
    ).rejects.toThrow(/no longer be edited/i);
  });
});

describe("revising a sent quote", () => {
  test("creates a new draft with the same lines and supersedes the original", async () => {
    const { tenant, quote } = await makeDraftQuote("Revise Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    const revision = await withRooferTenantContext(tenant.id, (tx) => reviseQuote(tx, tenant.id, quote.id));

    expect(revision.id).not.toBe(quote.id);
    expect(revision.status).toBe("draft");
    expect(revision.supersedesQuoteId).toBe(quote.id);
    expect(revision.quoteToken).not.toBe(quote.quoteToken);
    expect(revision.subtotalExGstCents).toBe(quote.subtotalExGstCents);

    const lines = await withRooferTenantContext(tenant.id, (tx) => listQuoteLines(tx, tenant.id, revision.id));
    expect(lines).toHaveLength(2);

    const [original] = await ownerDb.select().from(schema.quotes).where(eq(schema.quotes.id, quote.id));
    expect(original.status).toBe("superseded");
  });

  test("an accepted quote can't be revised", async () => {
    const { tenant, quote } = await makeDraftQuote("No Revise Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));
    await withRooferTenantContext(tenant.id, (tx) =>
      acceptQuote(tx, tenant.id, quote.id, { acceptedName: "Pat Homeowner" }),
    );

    await expect(withRooferTenantContext(tenant.id, (tx) => reviseQuote(tx, tenant.id, quote.id))).rejects.toThrow(
      /accepted/i,
    );
  });
});

describe("the customer accepting online", () => {
  test("records who accepted, wins the lead and creates the job", async () => {
    const { tenant, lead, quote } = await makeDraftQuote("Accept Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      acceptQuote(tx, tenant.id, quote.id, {
        acceptedName: "Pat Homeowner",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (iPhone)",
      }),
    );

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;

    expect(result.quote.acceptedName).toBe("Pat Homeowner");
    expect(result.quote.acceptedIp).toBe("203.0.113.7");
    expect(result.quote.acceptedUserAgent).toContain("iPhone");
    expect(result.quote.acceptedAt).not.toBeNull();
    expect(result.job.status).toBe("ready_to_schedule");
    expect(result.job.quoteId).toBe(quote.id);

    const [updatedLead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe("won");
  });

  test("a double-tapped accept creates exactly one job", async () => {
    const { tenant, quote } = await makeDraftQuote("Double Accept Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    await withRooferTenantContext(tenant.id, (tx) =>
      acceptQuote(tx, tenant.id, quote.id, { acceptedName: "Pat Homeowner" }),
    );
    const second = await withRooferTenantContext(tenant.id, (tx) =>
      acceptQuote(tx, tenant.id, quote.id, { acceptedName: "Someone Else" }),
    );

    expect(second.status).toBe("already_accepted");
    expect(await ownerDb.select().from(schema.jobs)).toHaveLength(1);
    // The original acceptance stands — a second tap can't rewrite who agreed.
    expect(second.quote.acceptedName).toBe("Pat Homeowner");
  });

  test("a quote that was never sent can't be accepted", async () => {
    const { tenant, quote } = await makeDraftQuote("Draft Accept Co");

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      acceptQuote(tx, tenant.id, quote.id, { acceptedName: "Too Early" }),
    );

    expect(result.status).toBe("not_acceptable");
    expect(await ownerDb.select().from(schema.jobs)).toHaveLength(0);
  });

  test("declining closes the lead as lost", async () => {
    const { tenant, lead, quote } = await makeDraftQuote("Decline Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    const result = await withRooferTenantContext(tenant.id, (tx) =>
      declineQuote(tx, tenant.id, quote.id, "Went with someone cheaper"),
    );

    expect(result.status).toBe("declined");
    expect(result.quote.declineReason).toBe("Went with someone cheaper");

    const [updatedLead] = await ownerDb.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe("lost");
  });
});

describe("the public quote page", () => {
  test("resolves everything from the token alone, with no session", async () => {
    const { tenant, quote } = await makeDraftQuote("Public Quote Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    const page = await getQuotePageData(quote.quoteToken);

    expect(page).not.toBeNull();
    expect(page!.businessName).toBe("Public Quote Co");
    expect(page!.customerName).toBe("Quote Customer");
    expect(page!.propertyAddress).toBe("8 Quote Lane");
    expect(page!.lines).toHaveLength(2);
    expect(page!.totalIncGstCents).toBe(200_911);
  });

  test("an unknown token resolves to nothing", async () => {
    expect(await getQuotePageData("not-a-real-token")).toBeNull();
  });
});

describe("quote follow-ups", () => {
  test("are 3 and 7 days after the quote was sent", () => {
    const sentAt = new Date("2026-10-07T02:00:00Z");
    const schedule = quoteFollowUpScheduleFor(sentAt);

    expect(schedule.followUp3d.getTime() - sentAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(schedule.followUp7d.getTime() - sentAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("the send-quote job texts and emails the customer their link", async () => {
    const { tenant, quote } = await makeDraftQuote("Quote Message Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    await handleSendQuote({ tenantId: tenant.id, quoteId: quote.id });

    const sent = await ownerDb
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.templateKey, "quote_sent"));

    expect(sent).toHaveLength(2); // sms + email
    expect(sent[0].body).toContain(quote.quoteToken);
    expect(sent[0].body).toContain("$2,009.11");
  });

  test("chase the customer while the quote is still unanswered", async () => {
    const { tenant, quote } = await makeDraftQuote("Chase Co");
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    await handleQuoteFollowUp3d({ tenantId: tenant.id, quoteId: quote.id });

    const sent = await ownerDb
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.templateKey, "quote_follow_up_3d"));
    expect(sent.length).toBeGreaterThan(0);
  });

  test.each([
    ["accepted", async (tenantId: string, quoteId: string) => {
      await withRooferTenantContext(tenantId, (tx) => acceptQuote(tx, tenantId, quoteId, { acceptedName: "Pat" }));
    }],
    ["declined", async (tenantId: string, quoteId: string) => {
      await withRooferTenantContext(tenantId, (tx) => declineQuote(tx, tenantId, quoteId));
    }],
    ["superseded", async (tenantId: string, quoteId: string) => {
      await withRooferTenantContext(tenantId, (tx) => reviseQuote(tx, tenantId, quoteId));
    }],
  ])("stop as soon as the quote is %s", async (_label, answer) => {
    const { tenant, quote } = await makeDraftQuote(`Stop ${_label} Co`);
    await withRooferTenantContext(tenant.id, (tx) => sendQuote(tx, tenant.id, quote.id, { type: "roofer" }));

    await answer(tenant.id, quote.id);

    await handleQuoteFollowUp3d({ tenantId: tenant.id, quoteId: quote.id });
    await handleQuoteFollowUp7d({ tenantId: tenant.id, quoteId: quote.id });

    const chased = await ownerDb
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.templateKey, "quote_follow_up_3d"));
    expect(chased).toHaveLength(0);
  });
});
