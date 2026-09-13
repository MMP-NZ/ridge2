import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/meta/webhook-signature";
import { processLeadgenDelivery, type LeadgenChange } from "@/lib/meta/process-delivery";

/**
 * GET: the one-time subscription verification handshake Meta performs
 * when you configure the webhook URL in the App dashboard.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

interface MetaWebhookPayload {
  object: string;
  entry: {
    id: string;
    changes: { field: string; value: Record<string, unknown> }[];
  }[];
}

/**
 * POST: the actual leadgen delivery. Signature verification happens over
 * the *raw* body (request.text(), not request.json()) — that's the only
 * thing standing between "a request from Meta" and "a request from
 * anyone who found the URL". Returns 200 for every *recognized* outcome
 * (ignored/duplicate/processed/failed — all return values from
 * processLeadgenDelivery, never thrown) so Meta doesn't redeliver a
 * payload we've already handled. If processLeadgenDelivery instead throws
 * — a Graph API call failing, a DB outage, anything unexpected — that's a
 * transient failure on our end, not a lead we've decided to reject, so we
 * return 500 and let Meta's own retry redeliver it. That's safe to do for
 * the whole batch even if some entries already succeeded: the leadgen_id
 * uniqueness check means a retried entry that already committed just
 * resolves to "duplicate" next time, not a second lead.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  let hadUnexpectedFailure = false;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const value = change.value as Partial<LeadgenChange>;
      if (!value.leadgen_id || !value.page_id) continue;

      try {
        await processLeadgenDelivery(value as LeadgenChange);
      } catch (err) {
        console.error("Meta leadgen delivery processing failed:", err);
        hadUnexpectedFailure = true;
      }
    }
  }

  if (hadUnexpectedFailure) {
    return new NextResponse("Processing failed, retry", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
