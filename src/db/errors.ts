/**
 * Postgres SQLSTATE 23505 (unique_violation) — used to detect a losing race
 * against a unique constraint (booking concurrency, M2; webhook idempotency,
 * M3). Walks `.cause` because drizzle-orm wraps every query failure in a
 * DrizzleQueryError whose own `.code` is unset — the real Postgres error
 * (with `.code`) is one level down, in `.cause`.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
