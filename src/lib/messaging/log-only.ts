import type { SmsSender, EmailSender } from "./types";

/**
 * The default transport (CLAUDE.md non-negotiable: "No outbound message is
 * sent to a real person from dev or staging"). Never calls a real API —
 * the caller (src/lib/messaging/send.ts) is the one that writes the
 * `messages` row either way, so this only needs to look like it worked.
 */
export const logOnlySmsSender: SmsSender = {
  async send(to, body) {
    console.log(`[log-only sms] to=${to} body=${JSON.stringify(body)}`);
    return {};
  },
};

export const logOnlyEmailSender: EmailSender = {
  async send(to, subject, body) {
    console.log(`[log-only email] to=${to} subject=${JSON.stringify(subject)} body=${JSON.stringify(body)}`);
    return {};
  },
};
