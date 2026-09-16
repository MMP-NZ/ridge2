import type { OutboxStore, OutboxSubmitters } from "./outbox-types";

export interface FlushResult {
  sent: number;
  failed: number;
}

/**
 * Sends everything the outbox is holding, and leaves behind anything that
 * didn't make it.
 *
 * Captures go before photos: a photo is only meaningful once the visit it
 * belongs to has been written up, and the server resolves a photo against
 * its visit.
 *
 * Each entry is sent on its own and failures are isolated — one photo that
 * won't upload must not strand the capture or the other photos, because the
 * next flush only retries what's still pending. Anything that fails keeps
 * its place in the queue with the error recorded against it.
 */
export async function flushOutbox(store: OutboxStore, submitters: OutboxSubmitters): Promise<FlushResult> {
  const pending = await store.listPending();
  const ordered = [
    ...pending.filter((entry) => entry.kind === "capture"),
    ...pending.filter((entry) => entry.kind === "photo"),
  ];

  let sent = 0;
  let failed = 0;

  for (const entry of ordered) {
    try {
      if (entry.kind === "capture") {
        await submitters.submitCapture(entry.payload);
      } else {
        await submitters.submitPhoto(entry.payload);
      }
      await store.markDone(entry.id);
      sent += 1;
    } catch (err) {
      await store.markFailed(entry.id, err instanceof Error ? err.message : String(err));
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * Wraps flushOutbox so overlapping triggers share one run rather than
 * racing. Both the `online` event and the app being opened can fire at
 * nearly the same moment — without this, the same entry could be in flight
 * twice. The database's unique constraints would still refuse the
 * duplicate, but two uploads of the same roof photo over a rural connection
 * is a waste worth avoiding.
 */
export function createOutboxFlusher(store: OutboxStore, submitters: OutboxSubmitters): () => Promise<FlushResult> {
  let inFlight: Promise<FlushResult> | null = null;

  return () => {
    inFlight ??= flushOutbox(store, submitters).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
