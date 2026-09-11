import { randomBytes } from "node:crypto";

/** A random URL-safe token, used anywhere a public unguessable identifier is needed (tenant intake keys, lead booking tokens). */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
