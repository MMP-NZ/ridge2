/**
 * CLAUDE.md's own naming: integrations wrapped behind small internal
 * interfaces so they can be faked in tests and swapped later — the same
 * shape as SmsSender/EmailSender in src/lib/messaging/types.ts.
 *
 * Photo bytes never live in Postgres. The store owns the bytes, the
 * visit_photos table owns the key and the metadata.
 */
export interface StoredPhoto {
  storageKey: string;
  byteSize: number;
}

export interface PhotoStore {
  /** Writes bytes and returns the key to record against the visit. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredPhoto>;
  /** Reads bytes back, for serving a photo to the roofer or a quote page. */
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

/**
 * Photos are addressed by tenant and visit so a roofer's images stay in his
 * own prefix — which is what makes a per-tenant export (M7) or deletion a
 * prefix operation rather than a scan.
 */
export function photoStorageKey(tenantId: string, visitId: string, clientPhotoId: string): string {
  return `tenants/${tenantId}/visits/${visitId}/${clientPhotoId}.jpg`;
}
