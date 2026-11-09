import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { PROFILE_IMAGE_MAX_BYTES, type PreparedProfileImage } from "@/server/profile-image";
import { identifyUploadBytes, resolveUploadContent, type DetectedUpload } from "@/server/upload-content";

const MAX_BYTES = 8 * 1024 * 1024;

function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join("data", "uploads"));
}

export async function storeUpload(input: {
  bytes: Buffer;
  originalName: string;
  declaredType?: string | null;
  ownerTable?: string;
  ownerId?: string;
  createdBy: number;
}): Promise<{ id: string }> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) {
    throw new Error("File must be between 1 byte and 8 MB.");
  }
  const detected = await resolveUploadContent({
    bytes: input.bytes,
    originalName: input.originalName,
    declaredType: input.declaredType,
  });
  const mime = detected.mimeType;
  const extension = detected.extension;
  const id = randomBytes(16).toString("hex");
  const root = uploadRoot();
  await fs.mkdir(root, { recursive: true });
  const filename = `${id}${extension}`;
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root)) throw new Error("Invalid upload path.");
  await fs.writeFile(absolute, input.bytes, { mode: 0o600 });
  try {
    await prisma.storedFile.create({
      data: {
        id,
        ownerTable: input.ownerTable ?? null,
        ownerId: input.ownerId ?? null,
        originalName: path.basename(input.originalName).slice(0, 255) || filename,
        storagePath: filename,
        mimeType: mime,
        sizeBytes: input.bytes.length,
        createdBy: input.createdBy,
      },
    });
  } catch (error) {
    await fs.unlink(absolute).catch(() => undefined);
    throw error;
  }
  return { id };
}

function safeUploadPath(filename: string): string {
  const root = uploadRoot();
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root + path.sep)) throw new Error("Invalid upload path.");
  return absolute;
}

export async function readStoredFileBytes(id: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const row = await prisma.storedFile.findUnique({ where: { id }, select: { storagePath: true } });
  if (!row?.storagePath) return null;
  return fs.readFile(safeUploadPath(row.storagePath));
}

/** Persist an image that has already been decoded and re-encoded. Rejects anything that is not a profile image. */
export async function storePreparedProfileImage(input: {
  prepared: PreparedProfileImage;
  createdBy: number;
  ownerId: string;
}): Promise<{ id: string }> {
  const { prepared } = input;
  if (prepared.bytes.length === 0 || prepared.bytes.length > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("Image must be between 1 byte and 5 MB.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(prepared.mimeType)) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  if (![".jpg", ".png", ".webp"].includes(prepared.extension)) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  let detected: DetectedUpload | null = null;
  try {
    detected = await identifyUploadBytes(prepared.bytes);
  } catch {
    detected = null;
  }
  if (!detected || detected.mimeType !== prepared.mimeType || detected.extension !== prepared.extension) {
    throw new Error("Upload a JPEG, PNG, or WebP image.");
  }
  const id = randomBytes(16).toString("hex");
  const filename = `${id}${prepared.extension}`;
  const root = uploadRoot();
  await fs.mkdir(root, { recursive: true });
  const absolute = safeUploadPath(filename);
  await fs.writeFile(absolute, prepared.bytes, { mode: 0o600 });
  try {
    await prisma.storedFile.create({
      data: {
        id,
        ownerTable: "users",
        ownerId: input.ownerId,
        originalName: `profile${prepared.extension}`,
        storagePath: filename,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.bytes.length,
        createdBy: input.createdBy,
      },
    });
  } catch (error) {
    await fs.unlink(absolute).catch(() => undefined);
    throw error;
  }
  return { id };
}

/** Drop files saved for a record write that did not commit. */
export async function releaseStoredUploads(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    try {
      await deleteStoredFile(id);
    } catch {
      // Keep going so one cleanup failure does not leave the rest behind.
    }
  }
}

export async function deleteStoredFile(id: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  const row = await prisma.storedFile.findUnique({ where: { id } });
  if (!row) return;
  const root = uploadRoot();
  const absolute = path.resolve(root, row.storagePath);
  if (!absolute.startsWith(root + path.sep)) return;
  await prisma.storedFile.delete({ where: { id } });
  await fs.unlink(absolute).catch(() => undefined);
}

export async function resolveStoredFile(id: string): Promise<{ absolute: string; mimeType: string; originalName: string; createdBy: number | null } | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const row = await prisma.storedFile.findUnique({ where: { id } });
  if (!row) return null;
  const root = uploadRoot();
  const absolute = path.resolve(root, row.storagePath);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null;
  return { absolute, mimeType: row.mimeType, originalName: row.originalName, createdBy: row.createdBy };
}
