import sharp from "sharp";
import { PROFILE_IMAGE_MAX_BYTES } from "@/features/profile/schema";

export { PROFILE_IMAGE_MAX_BYTES };

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export type PreparedProfileImage = {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: ".jpg" | ".png" | ".webp";
};

/** Decode the file with Sharp so the type comes from the image contents, then re-encode it. */
export async function prepareProfileImage(bytes: Buffer): Promise<PreparedProfileImage> {
  if (bytes.length === 0 || bytes.length > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("Image must be between 1 byte and 5 MB.");
  }
  let format: string | undefined;
  try {
    const meta = await sharp(bytes, { failOn: "error", limitInputPixels: 24_000_000 }).metadata();
    format = meta.format;
  } catch {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  const pipeline = sharp(bytes, { failOn: "error", limitInputPixels: 24_000_000 }).rotate();
  if (format === "jpeg") {
    return { bytes: await pipeline.jpeg({ quality: 85 }).toBuffer(), mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (format === "png") {
    return { bytes: await pipeline.png().toBuffer(), mimeType: "image/png", extension: ".png" };
  }
  return { bytes: await pipeline.webp({ quality: 85 }).toBuffer(), mimeType: "image/webp", extension: ".webp" };
}

export function profileAvatarPath(fileId: string): string {
  return `/api/files/${fileId}`;
}

/** Local stored-file id previously saved by this app. Legacy storage paths are left untouched. */
export function avatarStoredFileId(avatar: string | null | undefined): string | null {
  const match = /^\/api\/files\/([a-f0-9]{32})$/.exec((avatar ?? "").trim());
  return match?.[1] ?? null;
}
