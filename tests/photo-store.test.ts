import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { localDiskPhotoStore } from "@/lib/photos/local-disk";
import { getPhotoStore, photoStoreProblem } from "@/lib/photos/store";
import { photoStorageKey } from "@/lib/photos/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ridge-photos-"));
  process.env.PHOTO_STORE_DIR = dir;
});

afterAll(async () => {
  delete process.env.PHOTO_STORE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("photoStorageKey", () => {
  test("puts every photo under its own tenant's prefix", () => {
    const key = photoStorageKey("tenant-1", "visit-2", "photo-3");

    // A per-tenant prefix is what makes M7's data export (and a deletion
    // when a roofer leaves) a prefix operation rather than a scan.
    expect(key).toBe("tenants/tenant-1/visits/visit-2/photo-3.jpg");
    expect(key.startsWith("tenants/tenant-1/")).toBe(true);
  });
});

describe("localDiskPhotoStore", () => {
  test("round-trips bytes and content type", async () => {
    const key = photoStorageKey("tenant-1", "visit-1", "photo-1");
    const stored = await localDiskPhotoStore.put(key, bytes, "image/jpeg");

    expect(stored).toEqual({ storageKey: key, byteSize: bytes.byteLength });

    const read = await localDiskPhotoStore.get(key);
    expect(read?.contentType).toBe("image/jpeg");
    expect(Array.from(read!.bytes)).toEqual(Array.from(bytes));
  });

  test("returns null for a key that was never written, rather than throwing", async () => {
    expect(await localDiskPhotoStore.get(photoStorageKey("t", "v", "missing"))).toBeNull();
  });

  test("delete removes the photo and is safe to repeat", async () => {
    const key = photoStorageKey("tenant-1", "visit-1", "photo-2");
    await localDiskPhotoStore.put(key, bytes, "image/jpeg");

    await localDiskPhotoStore.delete(key);
    expect(await localDiskPhotoStore.get(key)).toBeNull();
    await expect(localDiskPhotoStore.delete(key)).resolves.toBeUndefined();
  });

  test("overwriting a key replaces it, so a retried upload can't double up", async () => {
    const key = photoStorageKey("tenant-1", "visit-1", "photo-3");
    await localDiskPhotoStore.put(key, bytes, "image/jpeg");
    await localDiskPhotoStore.put(key, new Uint8Array([9, 9]), "image/jpeg");

    const read = await localDiskPhotoStore.get(key);
    expect(Array.from(read!.bytes)).toEqual([9, 9]);

    const files = await readdir(path.join(dir, "tenants", "tenant-1", "visits", "visit-1"));
    expect(files.filter((f) => f.startsWith("photo-3.jpg"))).toHaveLength(2); // the photo and its .type sidecar
  });

  test("refuses a key that would escape the store directory", async () => {
    await expect(localDiskPhotoStore.put("../../escaped.jpg", bytes, "image/jpeg")).rejects.toThrow(/escapes/i);
  });
});

describe("getPhotoStore", () => {
  test("defaults to local disk, so no environment reaches S3 by accident", () => {
    delete process.env.LOCAL_PHOTO_STORE;
    expect(getPhotoStore()).toBe(localDiskPhotoStore);

    process.env.LOCAL_PHOTO_STORE = "true";
    expect(getPhotoStore()).toBe(localDiskPhotoStore);
  });

  test("only uses S3 when explicitly switched off, matching LOG_ONLY_TRANSPORT", () => {
    process.env.LOCAL_PHOTO_STORE = "false";
    expect(getPhotoStore()).not.toBe(localDiskPhotoStore);
    delete process.env.LOCAL_PHOTO_STORE;
  });
});

describe("photoStoreProblem (health check)", () => {
  const env = process.env as Record<string, string | undefined>;

  test("a production server with no photo directory is unhealthy, because the container disk is wiped each deploy", async () => {
    const nodeEnv = env.NODE_ENV;
    delete env.PHOTO_STORE_DIR;
    env.NODE_ENV = "production";
    try {
      expect(await photoStoreProblem()).toMatch(/lost on the next deploy/);
    } finally {
      env.NODE_ENV = nodeEnv;
    }
  });

  test("a writable photo directory is healthy", async () => {
    expect(await photoStoreProblem()).toBeNull();
  });

  test("a disk the app can't write to is unhealthy", async () => {
    await chmod(dir, 0o500);
    try {
      expect(await photoStoreProblem()).toMatch(/not writable/);
    } finally {
      await chmod(dir, 0o700);
    }
  });

  test("real S3 has nothing to check on disk", async () => {
    env.LOCAL_PHOTO_STORE = "false";
    delete env.PHOTO_STORE_DIR;
    try {
      expect(await photoStoreProblem()).toBeNull();
    } finally {
      delete env.LOCAL_PHOTO_STORE;
    }
  });
});
