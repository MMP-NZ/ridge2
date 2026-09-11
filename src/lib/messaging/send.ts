import { messages } from "@/db/schema";
import type { AppTx } from "@/db/client";
import { getSmsSender, getEmailSender } from "./transport";

export interface SendInput {
  tenantId: string;
  customerId: string;
  leadId?: string;
  channel: "sms" | "email";
  to: string;
  templateKey: string;
  subject?: string; // email only
  body: string;
}

async function dispatch(input: SendInput): Promise<string | undefined> {
  if (input.channel === "sms") {
    const result = await getSmsSender().send(input.to, input.body);
    return result.providerMessageId;
  }
  const result = await getEmailSender().send(input.to, input.subject ?? "", input.body);
  return result.providerMessageId;
}

/**
 * Booking confirmations, reminders, quote replies and invoice messages —
 * always allowed regardless of consent (CLAUDE.md messaging rules).
 * Everything M2 sends is transactional.
 */
export async function sendTransactional(tx: AppTx, input: SendInput): Promise<void> {
  const providerMessageId = await dispatch(input);
  await tx.insert(messages).values({
    tenantId: input.tenantId,
    customerId: input.customerId,
    leadId: input.leadId,
    channel: input.channel,
    direction: "outbound",
    templateKey: input.templateKey,
    body: input.body,
    status: "sent",
    providerMessageId,
  });
}

/**
 * Review requests, promotions — needs the customer's commercialConsent
 * flag (CLAUDE.md messaging rules). No M2 feature calls this yet; it
 * exists because M2's done-when explicitly requires the consent gate to
 * be provably correct ahead of the review-request feature that uses it.
 */
export async function sendCommercial(tx: AppTx, input: SendInput, consentGiven: boolean): Promise<void> {
  if (!consentGiven) {
    await tx.insert(messages).values({
      tenantId: input.tenantId,
      customerId: input.customerId,
      leadId: input.leadId,
      channel: input.channel,
      direction: "outbound",
      templateKey: input.templateKey,
      body: input.body,
      status: "blocked",
    });
    return;
  }

  const providerMessageId = await dispatch(input);
  await tx.insert(messages).values({
    tenantId: input.tenantId,
    customerId: input.customerId,
    leadId: input.leadId,
    channel: input.channel,
    direction: "outbound",
    templateKey: input.templateKey,
    body: input.body,
    status: "sent",
    providerMessageId,
  });
}
