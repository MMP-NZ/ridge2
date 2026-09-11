import type { SmsSender, EmailSender } from "./types";
import { logOnlySmsSender, logOnlyEmailSender } from "./log-only";
import { clickSendSmsSender } from "./clicksend";
import { mailgunEmailSender } from "./mailgun";

/** LOG_ONLY_TRANSPORT defaults to true (see .env.example) — real sends require explicitly setting it to "false". */
function isLogOnly(): boolean {
  return process.env.LOG_ONLY_TRANSPORT !== "false";
}

export function getSmsSender(): SmsSender {
  return isLogOnly() ? logOnlySmsSender : clickSendSmsSender;
}

export function getEmailSender(): EmailSender {
  return isLogOnly() ? logOnlyEmailSender : mailgunEmailSender;
}
