import { describe, test, expect, vi } from "vitest";
import { createMemoryOutboxStore } from "@/lib/offline/memory-outbox";
import { flushOutbox, createOutboxFlusher } from "@/lib/offline/flush";
import type { CapturedVisit, OutboxEntry, OutboxSubmitters, PendingPhoto } from "@/lib/offline/outbox-types";

/**
 * Build-plan M4 done-when: "A visit captured in airplane mode syncs
 * correctly once back online." These cover the queueing and flushing half
 * of that; the service worker that lets the page load with no reception in
 * the first place is verified by hand (see docs/decisions.md).
 */

function captureEntry(id: string, visitId = "visit-1"): OutboxEntry {
  const payload: CapturedVisit = {
    clientCaptureId: id,
    visitId,
    capturedAt: "2026-10-07T02:15:00.000Z",
    roofType: "gable",
    material: "corrugated steel",
    pitchDegrees: 25,
    areaM2: 148.5,
    condition: "fair",
    siteNotes: "Rust around the flashing on the north face.",
  };
  return { kind: "capture", id, payload, attempts: 0 };
}

function photoEntry(id: string, visitId = "visit-1"): OutboxEntry {
  const payload: PendingPhoto = {
    clientPhotoId: id,
    visitId,
    contentType: "image/jpeg",
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
  };
  return { kind: "photo", id, payload, attempts: 0 };
}

/** A server that refuses everything while the phone has no reception. */
function makeSubmitters(): OutboxSubmitters & { online: boolean; captures: string[]; photos: string[] } {
  const state = {
    online: false,
    captures: [] as string[],
    photos: [] as string[],
    async submitCapture(payload: CapturedVisit) {
      if (!state.online) throw new Error("Failed to fetch");
      state.captures.push(payload.clientCaptureId);
    },
    async submitPhoto(payload: PendingPhoto) {
      if (!state.online) throw new Error("Failed to fetch");
      state.photos.push(payload.clientPhotoId);
    },
  };
  return state;
}

describe("the outbox holds a visit captured with no reception", () => {
  test("nothing is lost while offline, and it all goes once back online", async () => {
    const store = createMemoryOutboxStore();
    const submitters = makeSubmitters();

    await store.put(captureEntry("capture-1"));
    await store.put(photoEntry("photo-1"));
    await store.put(photoEntry("photo-2"));

    // On the roof, in airplane mode.
    const offline = await flushOutbox(store, submitters);
    expect(offline).toEqual({ sent: 0, failed: 3 });
    expect(await store.listPending()).toHaveLength(3);
    expect(submitters.captures).toEqual([]);

    // Back in the ute, reception returns.
    submitters.online = true;
    const online = await flushOutbox(store, submitters);

    expect(online).toEqual({ sent: 3, failed: 0 });
    expect(await store.listPending()).toHaveLength(0);
    expect(submitters.captures).toEqual(["capture-1"]);
    expect(submitters.photos).toEqual(["photo-1", "photo-2"]);
  });

  test("the capture is sent before its photos", async () => {
    const store = createMemoryOutboxStore();
    const submitters = makeSubmitters();
    submitters.online = true;

    // Queued the wrong way round on purpose: photos taken, then the form saved.
    await store.put(photoEntry("photo-1"));
    await store.put(captureEntry("capture-1"));

    const order: string[] = [];
    await flushOutbox(store, {
      async submitCapture(p) {
        order.push(`capture:${p.clientCaptureId}`);
        await submitters.submitCapture(p);
      },
      async submitPhoto(p) {
        order.push(`photo:${p.clientPhotoId}`);
        await submitters.submitPhoto(p);
      },
    });

    expect(order).toEqual(["capture:capture-1", "photo:photo-1"]);
  });

  test("records the error and keeps the entry for the next attempt", async () => {
    const store = createMemoryOutboxStore();
    const submitters = makeSubmitters();

    await store.put(captureEntry("capture-1"));
    await flushOutbox(store, submitters);

    const [pending] = await store.listPending();
    expect(pending.attempts).toBe(1);
    expect(pending.lastError).toBe("Failed to fetch");

    await flushOutbox(store, submitters);
    const [stillPending] = await store.listPending();
    expect(stillPending.attempts).toBe(2);
  });
});

describe("one bad entry doesn't strand the rest", () => {
  test("a photo that won't upload leaves the capture and other photos sent", async () => {
    const store = createMemoryOutboxStore();
    await store.put(captureEntry("capture-1"));
    await store.put(photoEntry("photo-broken"));
    await store.put(photoEntry("photo-fine"));

    const result = await flushOutbox(store, {
      async submitCapture() {},
      async submitPhoto(p) {
        if (p.clientPhotoId === "photo-broken") throw new Error("413 Payload Too Large");
      },
    });

    expect(result).toEqual({ sent: 2, failed: 1 });

    const pending = await store.listPending();
    expect(pending.map((e) => e.id)).toEqual(["photo-broken"]);
    expect(pending[0].lastError).toBe("413 Payload Too Large");
  });
});

describe("a retry can't create anything twice", () => {
  test("a second flush after success sends nothing", async () => {
    const store = createMemoryOutboxStore();
    const submitters = makeSubmitters();
    submitters.online = true;

    await store.put(captureEntry("capture-1"));
    await store.put(photoEntry("photo-1"));

    await flushOutbox(store, submitters);
    const second = await flushOutbox(store, submitters);

    expect(second).toEqual({ sent: 0, failed: 0 });
    expect(submitters.captures).toEqual(["capture-1"]);
    expect(submitters.photos).toEqual(["photo-1"]);
  });

  test("overlapping triggers share one run instead of racing", async () => {
    const store = createMemoryOutboxStore();
    await store.put(captureEntry("capture-1"));

    const submitCapture = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const flush = createOutboxFlusher(store, { submitCapture, async submitPhoto() {} });

    // The `online` event and the app being opened, at effectively the same moment.
    const [a, b] = await Promise.all([flush(), flush()]);

    expect(submitCapture).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);

    // A later trigger still works — the guard clears once the run finishes.
    await store.put(captureEntry("capture-2"));
    await flush();
    expect(submitCapture).toHaveBeenCalledTimes(2);
  });

  test("the capture carries the id the database uses to reject a duplicate", async () => {
    const store = createMemoryOutboxStore();
    const submitters = makeSubmitters();
    submitters.online = true;

    await store.put(captureEntry("capture-1"));
    await flushOutbox(store, submitters);

    // UNIQUE(tenant_id, client_capture_id) is what makes a replay a no-op
    // server-side, so the id has to survive the round trip intact.
    expect(submitters.captures).toEqual(["capture-1"]);
  });
});
