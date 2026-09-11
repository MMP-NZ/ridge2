import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, totpEnrollmentUri, verifyTotpCode, verifyTotpCodeEncrypted } from "@/lib/auth/totp";
import { encryptSecret, decryptSecret } from "@/lib/auth/encryption";
import { createRooferSession, verifySessionToken, destroySessionToken } from "@/lib/auth/session";
import { truncateAllTables } from "./db-helpers";
import { makeTenant } from "./factories";
import * as OTPAuth from "otpauth";

const ownerSql = postgres(process.env.DATABASE_MIGRATE_URL!, { max: 1 });
const ownerDb = drizzle(ownerSql, { schema });

beforeEach(async () => {
  await truncateAllTables();
});

afterAll(async () => {
  await ownerSql.end();
});

describe("password hashing", () => {
  test("verifies a correct password and rejects an incorrect one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});

describe("encryption", () => {
  test("round-trips a secret", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(encrypted).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(encrypted)).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("TOTP", () => {
  test("accepts the current code and rejects a wrong one", () => {
    const { secret } = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const currentCode = totp.generate();

    expect(verifyTotpCode("roofer@example.com", secret, currentCode)).toBe(true);
    expect(verifyTotpCode("roofer@example.com", secret, "000000")).toBe(false);
  });

  test("verifies through the encrypted-at-rest form the way it's actually stored", () => {
    const { secret, encrypted } = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
    const currentCode = totp.generate();

    expect(verifyTotpCodeEncrypted("roofer@example.com", encrypted, currentCode)).toBe(true);
  });

  test("enrollment URI names the product, not the codename", () => {
    const { secret } = generateTotpSecret();
    const uri = totpEnrollmentUri("roofer@example.com", secret);
    expect(uri).not.toMatch(/ridge/i);
  });
});

describe("sessions", () => {
  test("a freshly created session verifies", async () => {
    const tenant = await makeTenant(ownerDb, "Session Co");
    const [roofer] = await ownerDb
      .insert(schema.rooferUsers)
      .values({ tenantId: tenant.id, email: "session@example.com", passwordHash: "x" })
      .returning();

    const token = await createRooferSession(roofer.id, tenant.id);
    const session = await verifySessionToken(token);

    expect(session).not.toBeNull();
    expect(session!.rooferUserId).toBe(roofer.id);
    expect(session!.tenantId).toBe(tenant.id);
  });

  test("an expired session fails verification and is removed", async () => {
    const tenant = await makeTenant(ownerDb, "Expired Co");
    const [roofer] = await ownerDb
      .insert(schema.rooferUsers)
      .values({ tenantId: tenant.id, email: "expired@example.com", passwordHash: "x" })
      .returning();

    const token = "test-expired-token-not-random-on-purpose";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await ownerDb.insert(schema.sessions).values({
      userType: "roofer",
      rooferUserId: roofer.id,
      tenantId: tenant.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await verifySessionToken(token)).toBeNull();

    const remaining = await ownerDb.select().from(schema.sessions);
    expect(remaining).toHaveLength(0);
  });

  test("destroying a session prevents it from verifying again", async () => {
    const tenant = await makeTenant(ownerDb, "Logout Co");
    const [roofer] = await ownerDb
      .insert(schema.rooferUsers)
      .values({ tenantId: tenant.id, email: "logout@example.com", passwordHash: "x" })
      .returning();

    const token = await createRooferSession(roofer.id, tenant.id);
    await destroySessionToken(token);

    expect(await verifySessionToken(token)).toBeNull();
  });
});
