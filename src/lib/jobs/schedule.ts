/**
 * Pure timing logic for the no-booking follow-up sequence (build-plan M2:
 * "nudge at 4 hours, final nudge at 2 days ... marked cold at 7 days").
 * Kept independent of pg-boss so the timing itself is unit-testable
 * without a running worker — see tests/follow-up.test.ts.
 */
export interface FollowUpSchedule {
  nudge4h: Date;
  nudge2d: Date;
  markCold7d: Date;
}

export function followUpScheduleFor(createdAt: Date): FollowUpSchedule {
  return {
    nudge4h: new Date(createdAt.getTime() + 4 * 60 * 60 * 1000),
    nudge2d: new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000),
    markCold7d: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
}

/** The 2-day "needs a call" cutoff — a lead created before this instant, still `new`, needs a human call (build-plan: "call task at 2 days"). */
export function needsCallCutoff(now: Date): Date {
  return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
}

/** Build-plan M4: "Quote follow-ups at 3 and 7 days if not accepted", measured from when the quote was sent. */
export interface QuoteFollowUpSchedule {
  followUp3d: Date;
  followUp7d: Date;
}

export function quoteFollowUpScheduleFor(sentAt: Date): QuoteFollowUpSchedule {
  return {
    followUp3d: new Date(sentAt.getTime() + 3 * 24 * 60 * 60 * 1000),
    followUp7d: new Date(sentAt.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
}
