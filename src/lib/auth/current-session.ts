import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { verifySessionToken } from "./session";

export const SESSION_COOKIE_NAME = "ridge_session";

export interface CurrentRooferSession {
  rooferUserId: string;
  tenantId: string;
}

/**
 * Reads and verifies the session cookie for a Server Component / Route
 * Handler. Returns null if absent, expired, or not a roofer session.
 * Wrapped in React's cache() so the layout guard and a page that both call
 * this in the same request share one DB lookup instead of two.
 */
export const getCurrentRooferSession = cache(async (): Promise<CurrentRooferSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session || session.userType !== "roofer" || !session.rooferUserId || !session.tenantId) {
    return null;
  }

  return { rooferUserId: session.rooferUserId, tenantId: session.tenantId };
});
