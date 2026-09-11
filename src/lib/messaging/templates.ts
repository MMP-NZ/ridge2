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

export function noBookingNudge2dMessage(businessName: string, bookingToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/book/${bookingToken}`;
  return {
    subject: `${businessName}: last chance to book your free roof check`,
    body: `${businessName} here — last chance to book your free roof check before we give you a call: ${url}`,
  };
}
