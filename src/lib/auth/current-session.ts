import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

export interface CurrentStaffSession {
  staffUserId: string;
}

/**
 * The Juno Logic staff equivalent. Separate from the roofer session on
 * purpose: staff work across every tenant, so there is no tenantId here —
 * a staff screen has to name the tenant it's touching, and that name goes
 * into the audit log via withStaffTenantAccess.
 */
export const getCurrentStaffSession = cache(async (): Promise<CurrentStaffSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session || session.userType !== "staff" || !session.staffUserId) return null;

  return { staffUserId: session.staffUserId };
});

/**
 * The guard every staff screen starts with.
 *
 * Explicit per page rather than in the staff layout: the staff login page
 * sits under the same route group, and a layout that redirected would send
 * it to itself in a loop.
 */
export async function requireStaffSession(): Promise<CurrentStaffSession> {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/staff/login");
  return session;
}
