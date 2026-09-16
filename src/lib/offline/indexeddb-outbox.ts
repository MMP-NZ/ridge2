import type { OutboxEntry, OutboxStore } from "./outbox-types";

/**
 * The real outbox: what the roofer wrote up on a roof with no reception,
 * held on the phone until it can be sent.
 *
 * Hand-rolled rather than pulling in idb or Dexie — this is four
 * operations on one object store, and the roofer's phone shouldn't
 * download a database library to queue a form.
 *
 * Nothing here runs on the server; every call is made from a client
 * component after mount.
 */
const DB_NAME = "ridge-outbox";
const DB_VERSION = 1;
const STORE = "entries";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export function createIndexedDbOutboxStore(): OutboxStore {
  return {
    async put(entry) {
      await withStore("readwrite", (store) => promisify(store.put(entry)));
    },

    async listPending() {
      const entries = await withStore("readonly", (store) => promisify(store.getAll()));
      return entries as OutboxEntry[];
    },

    async markDone(id) {
      await withStore("readwrite", (store) => promisify(store.delete(id)));
    },

    async markFailed(id, error) {
      await withStore("readwrite", async (store) => {
        const existing = (await promisify(store.get(id))) as OutboxEntry | undefined;
        if (!existing) return;
        await promisify(store.put({ ...existing, attempts: existing.attempts + 1, lastError: error }));
      });
    },
  };
}

/**
 * IndexedDB is unavailable in a private window, and Safari can throw on
 * access rather than returning null. A roofer with no outbox is worse off
 * offline but must still be able to use the app online, so callers treat
 * null as "no queueing available" instead of failing.
 */
export function tryCreateOutboxStore(): OutboxStore | null {
  try {
    if (typeof indexedDB === "undefined") return null;
    return createIndexedDbOutboxStore();
  } catch {
    return null;
  }
}
