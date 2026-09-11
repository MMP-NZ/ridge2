import * as OTPAuth from "otpauth";
import { PRODUCT_NAME } from "@/lib/config";
import { decryptSecret, encryptSecret } from "./encryption";

/** Generates a new TOTP secret for enrollment. Not yet stored — caller shows the QR/setup key and confirms with verifyTotp() before persisting. */
export function generateTotpSecret(): { secret: string; encrypted: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  return { secret: secret.base32, encrypted: encryptSecret(secret.base32) };
}

function totpFor(accountEmail: string, base32Secret: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: PRODUCT_NAME,
    label: accountEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
}

export function totpEnrollmentUri(accountEmail: string, base32Secret: string): string {
  return totpFor(accountEmail, base32Secret).toString();
}

/** Verifies a 6-digit code against an *unencrypted* base32 secret (enrollment step, before it's saved encrypted). */
export function verifyTotpCode(accountEmail: string, base32Secret: string, code: string): boolean {
  const delta = totpFor(accountEmail, base32Secret).validate({ token: code, window: 1 });
  return delta !== null;
}

/** Verifies a 6-digit code against an encrypted secret as stored in roofer_users/staff_users. */
export function verifyTotpCodeEncrypted(accountEmail: string, encryptedSecret: string, code: string): boolean {
  return verifyTotpCode(accountEmail, decryptSecret(encryptedSecret), code);
}
