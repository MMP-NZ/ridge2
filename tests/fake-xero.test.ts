import { describe, test, expect } from "vitest";
import { createFakeXero } from "@/lib/xero/fake";

/**
 * On staging the web server and the worker are separate processes, and both
 * restart on every deploy. Two fresh fakes stand in for that: if they can hand
 * out the same id, a new payment can be mistaken for one already recorded.
 */
describe("fake Xero ids across processes", () => {
  test("two fresh fakes never reuse an invoice or payment id", async () => {
    const webProcess = createFakeXero();
    const workerProcess = createFakeXero();
    const input = { contact: { name: "Fictional Roofing" }, lines: [{ description: "Roof", quantityThousandths: 1_000, unitPriceCents: 100_00 }] };

    const tokens = await webProcess.exchangeCode("code", "http://localhost/callback");
    const first = await webProcess.createDraftInvoice(tokens, input);
    const second = await workerProcess.createDraftInvoice(tokens, input);

    expect(first.xeroInvoiceId).not.toBe(second.xeroInvoiceId);

    const firstPayment = webProcess.recordPayment(first.xeroInvoiceId, 100_00);
    const secondPayment = workerProcess.recordPayment(second.xeroInvoiceId, 100_00);

    expect(firstPayment.xeroPaymentId).not.toBe(secondPayment.xeroPaymentId);
  });
});
