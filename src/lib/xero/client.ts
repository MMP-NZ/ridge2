import type { XeroClient } from "./types";
import { createFakeXero, type FakeXero } from "./fake";
import { xeroApiClient } from "./api";

/**
 * FAKE_XERO defaults to true, the same "safe by default" shape as
 * LOG_ONLY_TRANSPORT and LOCAL_PHOTO_STORE — real Xero calls require
 * explicitly setting it to "false".
 *
 * That default is load-bearing rather than merely convenient: this writes
 * invoices into a real business's accounting system, and an environment
 * that reaches production credentials by accident is a much worse outcome
 * than one that quietly doesn't.
 */
let fake: FakeXero | undefined;

function isFake(): boolean {
  return process.env.FAKE_XERO !== "false";
}

export function getXeroClient(): XeroClient {
  if (!isFake()) return xeroApiClient;
  fake ??= createFakeXero();
  return fake;
}

/** The fake itself, for tests that need to record a payment or revoke access. */
export function getFakeXero(): FakeXero {
  if (!isFake()) throw new Error("getFakeXero() called while FAKE_XERO=false");
  fake ??= createFakeXero();
  return fake;
}

/** Drops the in-memory Xero between tests. */
export function resetFakeXero(): void {
  fake = undefined;
}
