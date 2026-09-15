import { PRODUCT_NAME } from "@/lib/config";
import { formatNzDateTime } from "@/lib/time";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function bookingLinkMessage(businessName: string, bookingToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/book/${bookingToken}`;
  return {
    subject: `${businessName}: pick a time for your free roof check`,
    body: `Thanks, ${businessName} here (via ${PRODUCT_NAME}). Pick a time for a free roof check: ${url}`,
  };
}

export function visitConfirmationMessage(businessName: string, startAt: Date): { subject: string; body: string } {
  return {
    subject: `${businessName}: quote visit confirmed`,
    body: `${businessName} confirmed: your quote visit is booked for ${formatNzDateTime(startAt)}.`,
  };
}

export function visitReminderMessage(businessName: string, startAt: Date): { subject: string; body: string } {
  return {
    subject: `${businessName}: quote visit reminder`,
    body: `Reminder from ${businessName}: your quote visit is tomorrow, ${formatNzDateTime(startAt)}.`,
  };
}

export function noBookingNudge4hMessage(businessName: string, bookingToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/book/${bookingToken}`;
  return {
    subject: `${businessName}: still keen for a free roof check?`,
    body: `${businessName} here — still keen for a free roof check? Pick a time: ${url}`,
  };
}

/**
 * Quote messages are transactional under the Unsolicited Electronic
 * Messages Act — they're the reply to an enquiry the customer made and a
 * visit they booked — so they go through sendTransactional and need no
 * consent flag (CLAUDE.md messaging rules).
 */
export function quoteSentMessage(
  businessName: string,
  quoteToken: string,
  totalIncGst: string,
): { subject: string; body: string } {
  const url = `${baseUrl()}/quote/${quoteToken}`;
  return {
    subject: `${businessName}: your roofing quote`,
    body: `${businessName} here — your quote is ready: ${totalIncGst} including GST. Have a look and accept online: ${url}`,
  };
}

export function quoteFollowUp3dMessage(businessName: string, quoteToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/quote/${quoteToken}`;
  return {
    subject: `${businessName}: any questions about your quote?`,
    body: `${businessName} here — any questions about your quote? Happy to talk it through. ${url}`,
  };
}

export function quoteFollowUp7dMessage(businessName: string, quoteToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/quote/${quoteToken}`;
  return {
    subject: `${businessName}: still thinking about your roof?`,
    body: `${businessName} here — still thinking it over? Your quote is here when you're ready: ${url}`,
  };
}

export function noBookingNudge2dMessage(businessName: string, bookingToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/book/${bookingToken}`;
  return {
    subject: `${businessName}: last chance to book your free roof check`,
    body: `${businessName} here — last chance to book your free roof check before we give you a call: ${url}`,
  };
}
