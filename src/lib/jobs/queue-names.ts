/** Every pg-boss queue this app uses. Centralised so getQueue() (src/lib/queue.ts) can ensure they all exist, and the worker can register a handler for each. */
export const JOB_NAMES = {
  SEND_BOOKING_LINK: "send-booking-link",
  NO_BOOKING_NUDGE_4H: "no-booking-nudge-4h",
  NO_BOOKING_NUDGE_2D: "no-booking-nudge-2d",
  MARK_COLD_7D: "mark-cold-7d",
  SEND_VISIT_CONFIRMATION: "send-visit-confirmation",
  SEND_VISIT_REMINDER: "send-visit-reminder",
  SEND_QUOTE: "send-quote",
  QUOTE_FOLLOW_UP_3D: "quote-follow-up-3d",
  QUOTE_FOLLOW_UP_7D: "quote-follow-up-7d",
  SEND_JOB_CONFIRMATION: "send-job-confirmation",
  SEND_JOB_MOVED: "send-job-moved",
  SEND_JOB_REMINDER: "send-job-reminder",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface LeadJobPayload {
  tenantId: string;
  leadId: string;
}

export interface VisitJobPayload {
  tenantId: string;
  visitId: string;
}

export interface QuoteJobPayload {
  tenantId: string;
  quoteId: string;
}

export interface WorkJobPayload {
  tenantId: string;
  jobId: string;
  /**
   * The first work day this message is about, as YYYY-MM-DD. The reminder
   * handler compares it against the job's current first day and no-ops if
   * they differ — that's what stops a reminder firing for a date the job
   * has since been moved off, without needing job cancellation.
   */
  forDate: string;
}
