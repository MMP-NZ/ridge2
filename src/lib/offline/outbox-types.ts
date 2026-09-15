/**
 * The offline outbox: what a roofer records on a roof with no reception,
 * held on the phone until it can be sent.
 *
 * Build-plan M4: "Visit capture ... works offline and syncs when reception
 * returns", and its done-when check is a visit captured in airplane mode
 * syncing correctly once back online.
 *
 * Entries carry a client-generated id (crypto.randomUUID()) which is also
 * the database's idempotency key — UNIQUE(tenant_id, client_capture_id) on
 * visits and UNIQUE(tenant_id, client_photo_id) on visit_photos. That is
 * what makes a retry safe: the phone can send the same entry twice without
 * creating two of anything.
 */

export interface CapturedVisit {
  clientCaptureId: string;
  visitId: string;
  capturedAt: string; // ISO 8601, taken from the phone's clock at capture time
  roofType?: string;
  material?: string;
  pitchDegrees?: number;
  areaM2?: number;
  condition?: "good" | "fair" | "poor" | "urgent";
  siteNotes?: string;
}

export interface PendingPhoto {
  clientPhotoId: string;
  visitId: string;
  contentType: string;
  /**
   * Held as an ArrayBuffer rather than a Blob: Blobs in IndexedDB have a
   * long history of being unreliable on iOS Safari, which is the device
   * this whole feature exists for.
   */
  bytes: ArrayBuffer;
  caption?: string;
}

export type OutboxEntry =
  | { kind: "capture"; id: string; payload: CapturedVisit; attempts: number; lastError?: string }
  | { kind: "photo"; id: string; payload: PendingPhoto; attempts: number; lastError?: string };

export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  listPending(): Promise<OutboxEntry[]>;
  markDone(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface OutboxSubmitters {
  submitCapture(payload: CapturedVisit): Promise<void>;
  submitPhoto(payload: PendingPhoto): Promise<void>;
}
