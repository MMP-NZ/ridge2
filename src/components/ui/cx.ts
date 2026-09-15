/** Tiny class-name joiner. Keeps the primitives free of a runtime dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
