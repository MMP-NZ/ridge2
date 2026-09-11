/** Every pg-boss queue this app uses. Centralised so getQueue() (src/lib/queue.ts) can ensure they all exist, and the worker can register a handler for each. */
export const JOB_NAMES = {
  SEND_BOOKING_LINK: "send-booking-link",
  NO_BOOKING_NUDGE_4H: "no-booking-nudge-4h",
  NO_BOOKING_NUDGE_2D: "no-booking-nudge-2d",
  MARK_COLD_7D: "mark-cold-7d",
  SEND_VISIT_CONFIRMATION: "send-visit-confirmation",
  SEND_VISIT_REMINDER: "send-visit-reminder",
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
