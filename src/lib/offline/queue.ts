import { tryCreateOutboxStore } from "./indexeddb-outbox";
import type { CapturedVisit, PendingPhoto } from "./outbox-types";

/** Lets the app-wide OfflineSync indicator update the moment something is queued. */
function announce(): void {
  window.dispatchEvent(new Event("ridge:outbox-changed"));
}

/**
 * Puts a capture in the outbox to be sent when reception returns.
 *
 * Returns false when the phone has no usable IndexedDB (a private window,
 * or Safari refusing access). The caller has to tell the roofer the truth
 * in that case — quietly dropping a roof he just measured would be the
 * worst possible failure for this feature.
 */
export async function queueCapture(payload: CapturedVisit): Promise<boolean> {
  const store = tryCreateOutboxStore();
  if (!store) return false;

  await store.put({ kind: "capture", id: payload.clientCaptureId, payload, attempts: 0 });
  announce();
  return true;
}

export async function queuePhoto(payload: PendingPhoto): Promise<boolean> {
  const store = tryCreateOutboxStore();
  if (!store) return false;

  await store.put({ kind: "photo", id: payload.clientPhotoId, payload, attempts: 0 });
  announce();
  return true;
}

/** True when the browser is confident there's no connection at all. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
