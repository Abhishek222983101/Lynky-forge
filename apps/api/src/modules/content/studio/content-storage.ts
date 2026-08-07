// Turns generated image bytes into a persistable, publicly viewable URL.
//
// Production path: if Cloudinary is configured (CLOUDINARY_CLOUD_NAME/API_KEY/
// API_SECRET) the image is uploaded there and its public https URL is returned.
// This is what social platforms fetch on publish and what the dashboard shows,
// with no tunnel needed. If Cloudinary is not configured, we fall back to
// writing the file to <storage>/content/<uuid>.<ext> served by the API at
// `${MEDIA_BASE_URL}/media/content/<file>` (local dev).

import { promises as fs } from "fs";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { env } from "@/common/config/env";

function storageRoot(): string {
  return process.env.FILE_STORAGE_PATH ?? path.join(process.cwd(), "storage");
}

export function contentStorageDir(): string {
  return path.join(storageRoot(), "content");
}

/** Signed upload to Cloudinary. Returns the public secure_url, or null if
 * Cloudinary is not configured. Throws only on a genuine upload failure. */
async function uploadToCloudinary(buffer: Buffer, mimeType: string): Promise<string | null> {
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  const key = env.CLOUDINARY_API_KEY;
  const secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "sornam/content";
  // Cloudinary signs the alphabetically-sorted params it receives (minus file,
  // api_key, resource_type), with the api_secret appended, hashed with SHA1.
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(toSign + secret).digest("hex");

  const form = new URLSearchParams();
  form.set("file", `data:${mimeType};base64,${buffer.toString("base64")}`);
  form.set("api_key", key);
  form.set("timestamp", String(timestamp));
  form.set("folder", folder);
  form.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: unknown };
  if (!res.ok || !body.secure_url) {
    throw new Error(`Cloudinary upload failed: ${JSON.stringify(body)}`);
  }
  return body.secure_url;
}

export async function storeImage(buffer: Buffer, mimeType = "image/png"): Promise<string> {
  // Prefer the public CDN when configured (deploy-ready, no tunnel needed).
  try {
    const cdnUrl = await uploadToCloudinary(buffer, mimeType);
    if (cdnUrl) return cdnUrl;
  } catch (error) {
    // Do not fail generation if the CDN hiccups; fall back to local disk.
    // eslint-disable-next-line no-console
    console.warn(`Cloudinary upload failed, falling back to local disk: ${error instanceof Error ? error.message : error}`);
  }

  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const dir = contentStorageDir();
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, name), buffer);
  return `${env.MEDIA_BASE_URL.replace(/\/$/, "")}/media/content/${name}`;
}
