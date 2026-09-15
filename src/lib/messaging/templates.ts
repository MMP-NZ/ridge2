import { PRODUCT_NAME } from "@/lib/config";
import { formatNzDate, formatNzDateTime, nzLocalToUtc } from "@/lib/time";

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

/**
 * Job messages. Transactional under the Unsolicited Electronic Messages
 * Act — they're about work the customer has already agreed to — so no
 * consent flag is needed (CLAUDE.md messaging rules).
 */
function describeDays(days: string[]): string {
  if (days.length === 0) return "";
  const readable = days.map((day) => {
    const [year, month, date] = day.split("-").map(Number);
    // Midday *NZ time*, not midday UTC. NZ runs up to 13 hours ahead, so
    // Date.UTC(...12:00) on the 12th is 1am on the 13th here — which would
    // tell the customer we're coming a day after we are.
    return formatNzDate(nzLocalToUtc(year, month, date, 12, 0));
  });
  if (readable.length === 1) return readable[0];
  return `${readable.slice(0, -1).join(", ")} and ${readable[readable.length - 1]}`;
}

export function jobConfirmationMessage(businessName: string, days: string[]): { subject: string; body: string } {
  const when = describeDays(days);
  return {
    subject: `${businessName}: your roofing work is booked in`,
    body: `${businessName} here — you're booked in for ${when}. We'll text you the day before.`,
  };
}

export function jobReminderMessage(businessName: string, days: string[]): { subject: string; body: string } {
  return {
    subject: `${businessName}: we're on your roof tomorrow`,
    body: `Reminder from ${businessName}: we're starting your roofing work tomorrow, ${describeDays(days.slice(0, 1))}.`,
  };
}

export function jobMovedMessage(businessName: string, days: string[]): { subject: string; body: string } {
  const when = describeDays(days);
  return {
    subject: `${businessName}: your roofing work has moved`,
    body: `${businessName} here — we've had to move your roofing work. It's now booked for ${when}. Sorry for the shuffle.`,
  };
}

/**
 * Overdue invoice reminders (build-plan M6: 7, 14 and 21 days).
 * Transactional — an account message about work already done, so no
 * consent gate. The tone escalates, but never past "firm and polite": the
 * roofer has to live in the same town as this customer.
 */
export function invoiceOverdueMessage(
  businessName: string,
  invoiceNumber: string | null,
  amountOwing: string,
  daysOverdue: number,
): { subject: string; body: string } {
  const reference = invoiceNumber ? `invoice ${invoiceNumber}` : "your invoice";

  if (daysOverdue >= 21) {
    return {
      subject: `${businessName}: ${reference} is three weeks overdue`,
      body: `${businessName} here — ${reference} for ${amountOwing} is now three weeks overdue. Could you let us know when it'll be paid, or give us a call if there's a problem?`,
    };
  }
  if (daysOverdue >= 14) {
    return {
      subject: `${businessName}: ${reference} is two weeks overdue`,
      body: `${businessName} here — ${reference} for ${amountOwing} is a couple of weeks overdue now. A quick payment would be much appreciated.`,
    };
  }
  return {
    subject: `${businessName}: a reminder about ${reference}`,
    body: `${businessName} here — just a reminder that ${reference} for ${amountOwing} was due last week. If you've already paid it, thanks and ignore this.`,
  };
}

export function noBookingNudge2dMessage(businessName: string, bookingToken: string): { subject: string; body: string } {
  const url = `${baseUrl()}/book/${bookingToken}`;
  return {
    subject: `${businessName}: last chance to book your free roof check`,
    body: `${businessName} here — last chance to book your free roof check before we give you a call: ${url}`,
  };
}
