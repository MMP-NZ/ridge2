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
  return process.env.LOCAL_PHOTO_STORE !== "false" ? localDiskPhotoStore : s3PhotoStore;
}
