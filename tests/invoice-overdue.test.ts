import { describe, test, expect, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, like } from "drizzle-orm";
import * as schema from "@/db/schema";
import { withRooferTenantContext } from "@/db/client";
import { findOrCreateCustomer, findOrCreateProperty } from "@/lib/crm/dedupe";
import { createLead } from "@/lib/crm/leads";
import { captureVisit } from "@/lib/visits/capture";
import { createQuoteForVisit, replaceQuoteLines, sendQuote } from "@/lib/quotes/quotes";
import { acceptQuote } from "@/lib/quotes/accept";
import { scheduleJob, completeJob } from "@/lib/scheduling/jobs";
import { getFakeXero, resetFakeXero } from "@/lib/xero/client";
import { saveTokens } from "@/lib/xero/connection";
import { pushInvoiceForJob } from "@/lib/xero/invoicing";
import { handleInvoiceOverdue } from "@/lib/xero/handlers";
import { OVERDUE_STAGES } from "@/lib/jobs/schedule-invoice-jobs";
import { invoiceOverdueMessage } from "@/lib/messaging/templates";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";

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

async function makeInvoicedJob(businessName: string, total = 7_000) {
  const tenant = await makeTenant(ownerDb, businessName);

  const lead = await withRooferTenantContext(tenant.id, async (tx) => {
    const customer = await findOrCreateCustomer(tx, tenant.id, {
      name: "Owing Customer",
      email: "owing@example.com",
      phone: "+64211234567",
    });
    const property = await findOrCreateProperty(tx, tenant.id, customer.id, "9 Owing Street");
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
    captureVisit(tx, tenant.id, visit.id, { clientCaptureId: crypto.randomUUID() }, { type: "roofer" }),
  );

  const tokens = await getFakeXero().exchangeCode("code", "http://localhost/callback");
  await withRooferTenantContext(tenant.id, (tx) => saveTokens(tx, tenant.id, tokens));

  const invoice = await withRooferTenantContext(tenant.id, async (tx) => {
    const draft = await createQuoteForVisit(tx, tenant.id, visit.id);
    await replaceQuoteLines(tx, tenant.id, draft.id, [
      { description: "Re-roofing", kind: "fixed", quantityThousandths: 1_000, unitPriceCents: d(total) },
    ]);
    await sendQuote(tx, tenant.id, draft.id, { type: "roofer" });
    const accepted = await acceptQuote(tx, tenant.id, draft.id, { acceptedName: "Owing Customer" });
    if (accepted.status !== "accepted") throw new Error("expected acceptance");
    await scheduleJob(tx, tenant.id, accepted.job.id, ["2026-10-12"]);
    await completeJob(tx, tenant.id, accepted.job.id);

    const pushed = await pushInvoiceForJob(tx, tenant.id, accepted.job.id);
    if (pushed.status !== "created") throw new Error("expected invoice");
    return pushed.invoice;
  });

  return { tenant, invoice };
}

const overdueMessages = () =>
  ownerDb.select().from(schema.messages).where(like(schema.messages.templateKey, "invoice_overdue%"));

describe("chasing an unpaid invoice", () => {
  test("goes out at 7, 14 and 21 days", () => {
    expect(OVERDUE_STAGES).toEqual([7, 14, 21]);
  });

  test("the wording escalates without getting nasty", () => {
    const seven = invoiceOverdueMessage("Roofing Co", "INV-1", "$1,000.00", 7);
    const twentyOne = invoiceOverdueMessage("Roofing Co", "INV-1", "$1,000.00", 21);

    expect(seven.body).toContain("just a reminder");
    expect(twentyOne.body).toContain("three weeks overdue");
    // The roofer has to live in the same town as this customer.
    for (const message of [seven, twentyOne]) {
      expect(message.body).not.toMatch(/immediately|legal|debt collect/i);
    }
  });

  test("an unpaid invoice gets chased, with the amount owing", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Chase Co");

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 7 });

    const sent = await overdueMessages();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].body).toContain("$7,000.00");
  });

  /**
   * The reason this handler talks to Xero at all. Payments reach us on a
   * twice-daily poll, so our copy can be half a day stale — and chasing
   * somebody who paid this morning is the sort of message that costs a
   * roofer a customer.
   */
  test("a customer who paid since the last sync is not chased", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Already Paid Co");

    // Paid in Xero, but never synced — our copy still says unpaid.
    getFakeXero().recordPayment(invoice.xeroInvoiceId, d(7_000));
    const [stale] = await ownerDb.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(stale.status).toBe("draft");
    expect(stale.netPaidExGstCents).toBe(0);

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 7 });

    expect(await overdueMessages()).toHaveLength(0);
  });

  test("and the freshness check brings the payment and its commission in while it's there", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Catch Up Co");
    getFakeXero().recordPayment(invoice.xeroInvoiceId, d(7_000));

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 7 });

    // Not just silence — the handler folded the payment in, so commission
    // lands here rather than waiting for the next scheduled sync.
    const entries = await ownerDb.select().from(schema.commissionEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].amountCents).toBe(d(420));

    const [updated] = await ownerDb.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(updated.netPaidExGstCents).toBe(d(7_000));
  });

  test("a part-paid invoice is chased for the balance only", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Part Paid Co");
    getFakeXero().recordPayment(invoice.xeroInvoiceId, d(3_000));

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 14 });

    const sent = await overdueMessages();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].body).toContain("$4,000.00");
    expect(sent[0].body).not.toContain("$7,000.00");
  });

  test("a voided invoice is left alone", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Voided Co");
    await ownerDb.update(schema.invoices).set({ status: "voided" }).where(eq(schema.invoices.id, invoice.id));

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 7 });

    expect(await overdueMessages()).toHaveLength(0);
  });

  test("nothing is chased while Xero needs reconnecting", async () => {
    const { tenant, invoice } = await makeInvoicedJob("Disconnected Co");
    await ownerDb
      .update(schema.xeroConnections)
      .set({ needsReconnectAt: new Date() })
      .where(eq(schema.xeroConnections.tenantId, tenant.id));

    await handleInvoiceOverdue({ tenantId: tenant.id, invoiceId: invoice.id, daysOverdue: 7 });

    // Better silent than chasing on figures we can no longer verify.
    expect(await overdueMessages()).toHaveLength(0);
  });
});
