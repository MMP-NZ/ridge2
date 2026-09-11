import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { sessions, type Session } from "@/db/schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Raw token is what's set in the cookie; only its hash is ever stored. */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createRooferSession(rooferUserId: string, tenantId: string): Promise<string> {
  const token = generateToken();
  await authDb()
    .insert(sessions)
    .values({
      userType: "roofer",
      rooferUserId,
      tenantId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  return token;
}

export async function createStaffSession(staffUserId: string): Promise<string> {
  const token = generateToken();
  await authDb()
    .insert(sessions)
    .values({
      userType: "staff",
      staffUserId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
  return token;
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  const [session] = await authDb().select().from(sessions).where(eq(sessions.tokenHash, hashToken(token))).limit(1);

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await destroySessionToken(token);
    return null;
  }
  return session;
}

export async function destroySessionToken(token: string): Promise<void> {
  await authDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
