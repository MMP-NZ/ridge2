import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import type { PhotoStore, StoredPhoto } from "./types";

/**
 * The production store. Bucket lives in the same NZ region as everything
 * else (CLAUDE.md: customer data hosted in NZ) — ap-southeast-6, Auckland.
 *
 * The bucket stays private: photos are served back through the app, which
 * is what lets RLS decide who may see a roof. No public URLs, no CDN.
 */
let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-6" });
  return client;
}

function bucket(): string {
  const name = process.env.PHOTO_S3_BUCKET;
  if (!name) throw new Error("PHOTO_S3_BUCKET is not set (see .env.example)");
  return name;
}

export const s3PhotoStore: PhotoStore = {
  async put(key, bytes, contentType): Promise<StoredPhoto> {
    await s3().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType }),
    );
    return { storageKey: key, byteSize: bytes.byteLength };
  },

  async get(key) {
    try {
      const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      const bytes = await result.Body!.transformToByteArray();
      return { bytes, contentType: result.ContentType ?? "image/jpeg" };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  },

  async delete(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};
