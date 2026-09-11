"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { rooferUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotpCodeEncrypted } from "@/lib/auth/totp";
import { createRooferSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/current-session";

export interface LoginState {
  error?: string;
}

/**
 * Password-only for now — TOTP enrollment has no UI yet (fast-follow before
 * any real pilot use, see docs/decisions.md). Verification already checks a
 * TOTP code if a roofer has one enrolled, so login doesn't need changes
 * once enrollment ships; it just currently never applies to the seed data.
 */
export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const [roofer] = await authDb().select().from(rooferUsers).where(eq(rooferUsers.email, email)).limit(1);
  if (!roofer) {
    return { error: "Email or password is wrong." };
  }

  const passwordOk = await verifyPassword(password, roofer.passwordHash);
  if (!passwordOk) {
    return { error: "Email or password is wrong." };
  }

  if (roofer.totpSecretEncrypted) {
    if (!totpCode || !verifyTotpCodeEncrypted(roofer.email, roofer.totpSecretEncrypted, totpCode)) {
      return { error: "Enter a valid code from your authenticator app." };
    }
  }

  const token = await createRooferSession(roofer.id, roofer.tenantId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/today");
}
