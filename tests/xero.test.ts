import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { captureVisit } from "@/lib/visits/capture";
import { createQuoteForVisit, replaceQuoteLines, sendQuote } from "@/lib/quotes/quotes";
import { acceptQuote } from "@/lib/quotes/accept";
import { scheduleJob, completeJob } from "@/lib/scheduling/jobs";
import { getFakeXero, resetFakeXero } from "@/lib/xero/client";
import { saveTokens, getUsableTokens, getConnection } from "@/lib/xero/connection";
import { pushInvoiceForJob, syncXeroForTenant } from "@/lib/xero/invoicing";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";
import type { LeadSource } from "@/db/schema";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

const d = (dollars: number) => Math.round(dollars * 100);

beforeEach(async () => {
  await truncateAllTables();
  resetFakeXero();
});

afterAll(async () => {
  await ownerSql.end();
});

/** A tenant with a finished job, connected to the fake Xero. */
async function makeFinishedJob(
  businessName: string,
  { source = "juno_website" as LeadSource, jobTotal = 7_000, connect = true, leadCreatedAt }: {
    source?: LeadSource;
    jobTotal?: number;
    connect?: boolean;
    leadCreatedAt?: Date;
  } = {},
) {
  const tenant = await makeTenant(ownerDb, businessName);

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, {
      name: "Invoice Customer",
      email: "invoice@example.com",
      phone: "+64211234567",
    });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "3 Invoice Way");
    return createLead(tx, tenant.id, { customerId: customer.id, propertyId: property.id, source }, { type: "system" });
  });

  if (leadCreatedAt) {
    await ownerDb.update(schema.leads).set({ createdAt: leadCreatedAt }).where(eq(schema.leads.id, lead.id));
  }

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
    captureVisit(tx, tenant.id, visit.id, { clientCaptureId: crypto.randomUUID(), areaM2: 100 }, { type: "roofer" }),
  );

  const job = await withRooferTenantContext(tenant.id, async (tx) => {
    const draft = await createQuoteForVisit(tx, tenant.id, visit.id);
    await replaceQuoteLines(tx, tenant.id, draft.id, [
      { description: "Re-roofing", kind: "fixed", quantityThousandths: 1_000, unitPriceCents: d(jobTotal) },
    ]);
    await sendQuote(tx, tenant.id, draft.id, { type: "roofer" });
    const accepted = await acceptQuote(tx, tenant.id, draft.id, { acceptedName: "Invoice Customer" });
    if (accepted.status !== "accepted") throw new Error("expected acceptance");
    await scheduleJob(tx, tenant.id, accepted.job.id, ["2026-10-12"]);
    return completeJob(tx, tenant.id, accepted.job.id);
  });

  if (connect) {
    const tokens = await getFakeXero().exchangeCode("code", "http://localhost/callback");
    await withRooferTenantContext(tenant.id, (tx) => saveTokens(tx, tenant.id, tokens));
  }

  return { tenant, job, lead };
}

describe("raising the invoice", () => {
  test("a finished job becomes a draft invoice built from the accepted quote", async () => {
    const { tenant, job } = await makeFinishedJob("Invoice Co");

    const result = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));

    expect(result.status).toBe("created");
    if (result.status !== "created") return;

    // A draft, never approved — the roofer gets the last look.
    expect(result.invoice.status).toBe("draft");
    expect(result.invoice.totalExGstCents).toBe(d(7_000));
    expect(result.invoice.invoiceNumber).toMatch(/^INV-/);
  });

  test("pushing twice doesn't raise a second invoice", async () => {
    const { tenant, job } = await makeFinishedJob("Twice Co");

    await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    const second = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));

    expect(second.status).toBe("already_invoiced");
    expect(await ownerDb.select().from(schema.invoices)).toHaveLength(1);
  });

  test("a job that isn't finished can't be invoiced", async () => {
    const { tenant, job } = await makeFinishedJob("Unfinished Co");
    await ownerDb.update(schema.jobs).set({ status: "scheduled" }).where(eq(schema.jobs.id, job.id));

    const result = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    expect(result.status).toBe("job_not_done");
  });

  test("without a Xero connection nothing is lost — it just isn't invoiced yet", async () => {
    const { tenant, job } = await makeFinishedJob("No Xero Co", { connect: false });

    const result = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));

    expect(result.status).toBe("not_connected");
    expect(await ownerDb.select().from(schema.invoices)).toHaveLength(0);
    // The job is untouched and still invoiceable once he connects.
    const [stillDone] = await ownerDb.select().from(schema.jobs).where(eq(schema.jobs.id, job.id));
    expect(stillDone.status).toBe("done");
  });
});

describe("payments becoming commission", () => {
  /** Build-plan M6 done-when: a payment produces the right commission entry. */
  test("a payment on a Juno-sourced job produces one commission entry at 6%", async () => {
    const { tenant, job } = await makeFinishedJob("Commission Co");
    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    const entries = await ownerDb.select().from(schema.commissionEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].amountCents).toBe(d(420));
    expect(entries[0].eligibilityReason).toBe("juno_sourced");
    expect(entries[0].capped).toBe(false);
  });

  test("re-polling the same payment doesn't charge the roofer twice", async () => {
    const { tenant, job } = await makeFinishedJob("Idempotent Co");
    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));

    // Twice daily means the same payment is seen again and again.
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    expect(await ownerDb.select().from(schema.invoicePayments)).toHaveLength(1);
    expect(await ownerDb.select().from(schema.commissionEntries)).toHaveLength(1);
  });

  test("part payments earn as they come in, and the cap holds across them", async () => {
    const { tenant, job } = await makeFinishedJob("Part Payment Co", { jobTotal: 90_000 });
    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    const fake = getFakeXero();
    fake.recordPayment(pushed.invoice.xeroInvoiceId, d(40_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    fake.recordPayment(pushed.invoice.xeroInvoiceId, d(50_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    const entries = await ownerDb
      .select()
      .from(schema.commissionEntries)
      .orderBy(schema.commissionEntries.createdAt);

    // The CLAUDE.md case, end to end through Xero rather than in isolation.
    expect(entries.map((e) => e.amountCents)).toEqual([d(2_400), d(2_600)]);
    expect(entries[1].runningCommissionCents).toBe(d(5_000));
    expect(entries[1].capped).toBe(true);
  });

  test("a credit note claws commission back", async () => {
    const { tenant, job } = await makeFinishedJob("Credit Note Co");
    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    const fake = getFakeXero();
    fake.recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    fake.recordPayment(pushed.invoice.xeroInvoiceId, d(-2_000), "credit_note");
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    const entries = await ownerDb
      .select()
      .from(schema.commissionEntries)
      .orderBy(schema.commissionEntries.createdAt);

    expect(entries.map((e) => e.amountCents)).toEqual([d(420), d(-120)]);
    expect(entries[1].runningCommissionCents).toBe(d(300));
  });

  test("a roofer_own job earns Juno Logic nothing, though the payment is still recorded", async () => {
    const { tenant, job } = await makeFinishedJob("Own Lead Co", { source: "roofer_own" });
    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    expect(await ownerDb.select().from(schema.invoicePayments)).toHaveLength(1);
    expect(await ownerDb.select().from(schema.commissionEntries)).toHaveLength(0);
  });

  test("the 12-month tail is measured from the original lead, not this job", async () => {
    // The roofer booked this one himself, but the customer came from Juno
    // 13 months ago — past the tail, so Juno Logic earns nothing.
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setUTCMonth(thirteenMonthsAgo.getUTCMonth() - 13);

    const { tenant, job, lead } = await makeFinishedJob("Tail Co", { source: "roofer_own" });
    // Give the customer an older Juno-sourced lead.
    await ownerDb.insert(schema.leads).values({
      tenantId: tenant.id,
      customerId: lead.customerId,
      propertyId: lead.propertyId,
      source: "juno_ads",
      bookingToken: `tail-${crypto.randomUUID()}`,
      createdAt: thirteenMonthsAgo,
    });

    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    expect(await ownerDb.select().from(schema.commissionEntries)).toHaveLength(0);
  });

  test("but an 11-month-old Juno lead still earns commission on later work", async () => {
    const elevenMonthsAgo = new Date();
    elevenMonthsAgo.setUTCMonth(elevenMonthsAgo.getUTCMonth() - 11);

    const { tenant, job, lead } = await makeFinishedJob("Tail Alive Co", { source: "roofer_own" });
    await ownerDb.insert(schema.leads).values({
      tenantId: tenant.id,
      customerId: lead.customerId,
      propertyId: lead.propertyId,
      source: "juno_ads",
      bookingToken: `tail-${crypto.randomUUID()}`,
      createdAt: elevenMonthsAgo,
    });

    const pushed = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    if (pushed.status !== "created") throw new Error("expected invoice");

    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    const entries = await ownerDb.select().from(schema.commissionEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].eligibilityReason).toBe("within_tail");
  });

  test("an invoice raised outside Ridge is left well alone", async () => {
    const { tenant } = await makeFinishedJob("Foreign Invoice Co");
    const tokens = await getFakeXero().exchangeCode("code", "http://localhost/callback");

    const foreign = await getFakeXero().createDraftInvoice(tokens, {
      contact: { name: "Someone Else" },
      lines: [{ description: "Not ours", quantityThousandths: 1_000, unitPriceCents: d(5_000) }],
    });
    getFakeXero().recordPayment(foreign.xeroInvoiceId, d(5_000));

    await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));

    // The roofer's other work is his own business, not Juno Logic's.
    expect(await ownerDb.select().from(schema.invoicePayments)).toHaveLength(0);
    expect(await ownerDb.select().from(schema.commissionEntries)).toHaveLength(0);
  });
});

/** Build-plan M6 done-when: revoking Xero shows a reconnect prompt, with nothing silently lost. */
describe("when the roofer revokes Xero access", () => {
  test("a failed refresh flags the connection instead of throwing", async () => {
    const { tenant } = await makeFinishedJob("Revoke Co");

    // Expire the token so the next call has to refresh, then revoke.
    await ownerDb
      .update(schema.xeroConnections)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.xeroConnections.tenantId, tenant.id));
    getFakeXero().revokeAccess();

    const auth = await withRooferTenantContext(tenant.id, (tx) => getUsableTokens(tx, tenant.id));
    expect(auth.status).toBe("needs_reconnect");

    const connection = await withRooferTenantContext(tenant.id, (tx) => getConnection(tx, tenant.id));
    expect(connection?.needsReconnectAt).not.toBeNull();
  });

  test("the job stays invoiceable and nothing is silently dropped", async () => {
    const { tenant, job } = await makeFinishedJob("Revoke Push Co");
    await ownerDb
      .update(schema.xeroConnections)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.xeroConnections.tenantId, tenant.id));
    getFakeXero().revokeAccess();

    const blocked = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    expect(blocked.status).toBe("needs_reconnect");
    expect(await ownerDb.select().from(schema.invoices)).toHaveLength(0);

    // He reconnects, and the same job invoices as if nothing happened.
    const fresh = await getFakeXero().exchangeCode("code", "http://localhost/callback");
    await withRooferTenantContext(tenant.id, (tx) => saveTokens(tx, tenant.id, fresh));

    const after = await withRooferTenantContext(tenant.id, (tx) => pushInvoiceForJob(tx, tenant.id, job.id));
    expect(after.status).toBe("created");

    const connection = await withRooferTenantContext(tenant.id, (tx) => getConnection(tx, tenant.id));
    expect(connection?.needsReconnectAt).toBeNull();
  });

  test("a sync while disconnected reports it rather than half-working", async () => {
    const { tenant } = await makeFinishedJob("Revoke Sync Co");
    await ownerDb
      .update(schema.xeroConnections)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.xeroConnections.tenantId, tenant.id));
    getFakeXero().revokeAccess();

    const result = await withRooferTenantContext(tenant.id, (tx) => syncXeroForTenant(tx, tenant.id));
    expect(result).toEqual({ status: "needs_reconnect" });
  });

  test("refresh rotation is persisted, so the next call works", async () => {
    const { tenant } = await makeFinishedJob("Rotation Co");
    const before = await withRooferTenantContext(tenant.id, (tx) => getConnection(tx, tenant.id));

    await ownerDb
      .update(schema.xeroConnections)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.xeroConnections.tenantId, tenant.id));

    const auth = await withRooferTenantContext(tenant.id, (tx) => getUsableTokens(tx, tenant.id));
    expect(auth.status).toBe("ok");

    // Xero invalidates the old refresh token on use — if we didn't store
    // the new one, the connection would be dead on the next refresh.
    const after = await withRooferTenantContext(tenant.id, (tx) => getConnection(tx, tenant.id));
    expect(after?.refreshTokenEncrypted).not.toBe(before?.refreshTokenEncrypted);
    expect(after!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("tenant isolation on the money tables", () => {
  test("a roofer can't see another roofer's invoices, payments or commission", async () => {
    const mine = await makeFinishedJob("Money Mine");
    const theirs = await makeFinishedJob("Money Theirs");

    const pushed = await withRooferTenantContext(theirs.tenant.id, (tx) =>
      pushInvoiceForJob(tx, theirs.tenant.id, theirs.job.id),
    );
    if (pushed.status !== "created") throw new Error("expected invoice");
    getFakeXero().recordPayment(pushed.invoice.xeroInvoiceId, d(7_000));
    await withRooferTenantContext(theirs.tenant.id, (tx) => syncXeroForTenant(tx, theirs.tenant.id));

    const myInvoices = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.invoices));
    const myPayments = await withRooferTenantContext(mine.tenant.id, (tx) => tx.select().from(schema.invoicePayments));
    const myCommission = await withRooferTenantContext(mine.tenant.id, (tx) =>
      tx.select().from(schema.commissionEntries),
    );
    const myConnections = await withRooferTenantContext(mine.tenant.id, (tx) =>
      tx.select().from(schema.xeroConnections),
    );

    expect(myInvoices).toHaveLength(0);
    expect(myPayments).toHaveLength(0);
    expect(myCommission).toHaveLength(0);
    // His own connection only — never the other roofer's Xero tokens.
    expect(myConnections).toHaveLength(1);
    expect(myConnections[0].tenantId).toBe(mine.tenant.id);
  });
});
