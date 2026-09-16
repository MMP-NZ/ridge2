import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { PhotoStore, StoredPhoto } from "./types";

/**
 * The default store, and the one dev and tests use — the equivalent of
 * messaging's log-only transport. Writes under PHOTO_STORE_DIR (default
 * .photos/, gitignored) so no AWS account is needed to run the site-visit
 * flow end to end.
 */
function baseDir(): string {
  return process.env.PHOTO_STORE_DIR ?? path.join(process.cwd(), ".photos");
}

function resolveWithinBase(key: string): string {
  const base = baseDir();
  const full = path.resolve(base, key);
  // Keys are built by photoStorageKey() from ids, never from user input, but
  // a store that can be talked into writing outside its own directory is the
  // kind of thing that only ever gets noticed after it matters.
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error("Photo key escapes the photo store directory");
  }
  return full;
}

export const localDiskPhotoStore: PhotoStore = {
  async put(key, bytes, contentType): Promise<StoredPhoto> {
    const full = resolveWithinBase(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    await writeFile(`${full}.type`, contentType, "utf8");
    return { storageKey: key, byteSize: bytes.byteLength };
  },

  async get(key) {
    const full = resolveWithinBase(key);
    try {
      const bytes = await readFile(full);
      const contentType = await readFile(`${full}.type`, "utf8").catch(() => "image/jpeg");
      return { bytes: new Uint8Array(bytes), contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },

  async delete(key) {
    const full = resolveWithinBase(key);
    await rm(full, { force: true });
    await rm(`${full}.type`, { force: true });
  },
};
