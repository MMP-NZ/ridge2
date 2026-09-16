import { access, mkdir, constants } from "node:fs/promises";
import type { PhotoStore } from "./types";
import { localDiskPhotoStore } from "./local-disk";
import { s3PhotoStore } from "./s3";

/**
 * LOCAL_PHOTO_STORE defaults to true (see .env.example), the same way
 * LOG_ONLY_TRANSPORT does for messaging — real S3 writes require explicitly
 * setting it to "false", so no environment reaches for an AWS bucket by
 * accident.
 */
export function getPhotoStore(): PhotoStore {
  return usesLocalDisk() ? localDiskPhotoStore : s3PhotoStore;
}

function usesLocalDisk(): boolean {
  return process.env.LOCAL_PHOTO_STORE !== "false";
}

/**
 * Called by the health check, so a deploy that would lose photos never goes
 * live. Returns the problem, or null when photos will be kept.
 *
 * Both failures are silent without this. A container's own filesystem is
 * wiped on every deploy, so a production server with no PHOTO_STORE_DIR
 * accepts photos and then loses them. A mounted disk the app's user can't
 * write to only shows up when a roofer's upload fails on a roof.
 */
export async function photoStoreProblem(): Promise<string | null> {
  if (!usesLocalDisk()) return null;

  const dir = process.env.PHOTO_STORE_DIR;
  if (!dir) {
    return process.env.NODE_ENV === "production"
      ? "LOCAL_PHOTO_STORE is on with no PHOTO_STORE_DIR, so photos would be lost on the next deploy"
      : null;
  }

  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return null;
  } catch {
    return `PHOTO_STORE_DIR (${dir}) is not writable by the app`;
  }
}
