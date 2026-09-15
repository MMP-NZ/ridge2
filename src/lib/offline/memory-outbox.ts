import type { OutboxEntry, OutboxStore } from "./outbox-types";

/**
 * An in-memory OutboxStore, the test counterpart to the IndexedDB one —
 * the same role log-only transports play for messaging. Keeps insertion
 * order, because captures must reach the server before the photos taken
 * during them.
 */
export function createMemoryOutboxStore(): OutboxStore & { all(): OutboxEntry[] } {
  const entries = new Map<string, OutboxEntry>();

  return {
    async put(entry) {
      entries.set(entry.id, entry);
    },
    async listPending() {
      return [...entries.values()];
    },
    async markDone(id) {
      entries.delete(id);
    },
    async markFailed(id, error) {
      const existing = entries.get(id);
      if (!existing) return;
      entries.set(id, { ...existing, attempts: existing.attempts + 1, lastError: error });
    },
    all() {
      return [...entries.values()];
    },
  };
}
