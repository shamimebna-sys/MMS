import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";

const MAX_BYTES = 8 * 1024 * 1024;

function uploadRoot(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join("data", "uploads"));
}

export async function storeUpload(input: {
  bytes: Buffer;
  originalName: string;
  ownerTable?: string;
  ownerId?: string;
  createdBy: number;
}): Promise<{ id: string }> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) {
    throw new Error("File must be between 1 byte and 8 MB.");
  }
  const isPdf = input.bytes.subarray(0, 5).toString("utf8") === "%PDF-";
  let mime = "application/pdf";
  let extension = ".pdf";
  if (!isPdf) {
    const image = sharp(input.bytes, { failOn: "error" });
    const meta = await image.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      throw new Error("Upload a PDF or a JPEG, PNG, or WebP image.");
    }
    mime = `image/${meta.format === "jpeg" ? "jpeg" : meta.format}`;
    extension = meta.format === "jpeg" ? ".jpg" : `.${meta.format}`;
    await image.rotate().toBuffer();
  }
  const id = randomBytes(16).toString("hex");
  const root = uploadRoot();
  await fs.mkdir(root, { recursive: true });
  const filename = `${id}${extension}`;
  const absolute = path.resolve(root, filename);
  if (!absolute.startsWith(root)) throw new Error("Invalid upload path.");
  await fs.writeFile(absolute, input.bytes, { mode: 0o600 });
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
  return { id };
}

export async function resolveStoredFile(id: string): Promise<{ absolute: string; mimeType: string; originalName: string } | null> {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const row = await prisma.storedFile.findUnique({ where: { id } });
  if (!row) return null;
  const root = uploadRoot();
  const absolute = path.resolve(root, row.storagePath);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null;
  return { absolute, mimeType: row.mimeType, originalName: row.originalName };
}
