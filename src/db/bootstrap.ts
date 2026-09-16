import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { staffUsers } from "./schema";
import { hashPassword } from "@/lib/auth/password";
import { withSetupContext } from "./setup-context";

/**
 * Creates the first Juno Logic staff login on a fresh database. Without one,
 * nobody can reach /staff, and the admin console is the only place a staff
 * member can be added.
 *
 *   node dist/bootstrap.mjs you@junologic.co.nz "Your Name"     (Docker image)
 *   pnpm db:bootstrap you@junologic.co.nz "Your Name"           (local)
 *
 * The password is generated here and printed once, rather than passed in, so
 * it never sits in shell history or a hosting dashboard's env vars.
 *
 * Idempotent: if the email already exists it says so and changes nothing. It
 * will never reset an existing staff member's password.
 */
async function main() {
  const [email, name] = process.argv.slice(2);
  if (!email || !name) {
    console.error('Usage: bootstrap <email> "<name>"');
    process.exit(1);
  }

  const normalisedEmail = email.trim().toLowerCase();
  const password = randomBytes(18).toString("base64url");

  const created = await withSetupContext(async (tx) => {
    const [existing] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, normalisedEmail));
    if (existing) return false;

    await tx.insert(staffUsers).values({
      email: normalisedEmail,
      name: name.trim(),
      passwordHash: await hashPassword(password),
    });
    return true;
  });

  if (!created) {
    console.log(`${normalisedEmail} already has a staff login. Nothing changed.`);
    return;
  }

  console.log(`Staff login created for ${normalisedEmail}.`);
  console.log(`Password (shown once, save it now): ${password}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
