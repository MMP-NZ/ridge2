"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/client";
import { staffUsers } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { verifyTotpCodeEncrypted } from "@/lib/auth/totp";
import { createStaffSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/current-session";

export interface StaffLoginState {
  error?: string;
}

/**
 * Juno Logic staff sign-in, deliberately separate from the roofer login.
 *
 * Staff can read every roofer's data, so this account is worth more to an
 * attacker than any single roofer's. Same password + TOTP verification as
 * the roofer path; when TOTP enrollment ships it should land here first.
 */
export async function staffLoginAction(_prev: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();

  if (!email || !password) return { error: "Enter your email and password." };

  const [staff] = await authDb().select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
  // Same message whether the email is unknown or the password is wrong —
  // a staff address shouldn't be confirmable by guessing at this form.
  if (!staff) return { error: "Email or password is wrong." };

  if (!(await verifyPassword(password, staff.passwordHash))) {
    return { error: "Email or password is wrong." };
  }

  if (staff.totpSecretEncrypted) {
    if (!totpCode || !verifyTotpCodeEncrypted(staff.email, staff.totpSecretEncrypted, totpCode)) {
      return { error: "Enter a valid code from your authenticator app." };
    }
  }

  const token = await createStaffSession(staff.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  redirect("/staff");
}
