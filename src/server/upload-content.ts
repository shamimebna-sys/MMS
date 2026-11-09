import path from "node:path";
import sharp from "sharp";

/** Shown when the bytes are not one of the upload types this app already accepts. */
export const UPLOAD_TYPE_ERROR = "Upload a PDF or a JPEG, PNG, or WebP image.";
/** Shown when a claimed PDF or image is cut off or does not decode. */
export const UPLOAD_MALFORMED_ERROR = "The file is truncated or malformed.";
/** Shown when the filename or client MIME type disagrees with the bytes. */
export const UPLOAD_MISMATCH_ERROR = "The file content does not match its type.";

export type DetectedUpload = {
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  extension: ".pdf" | ".jpg" | ".png" | ".webp";
};

const PDF_MARK = Buffer.from("%PDF-");
const PNG_MARK = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

const NAME_EXTENSIONS: Record<DetectedUpload["mimeType"], readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

/**
 * Identify an upload from its bytes.
 * PDFs must carry a real header, a finished object, and an end marker.
 * Images must match a known signature and decode with Sharp.
 */
export async function identifyUploadBytes(bytes: Buffer): Promise<DetectedUpload> {
  if (bytes.length >= PDF_MARK.length && bytes.subarray(0, PDF_MARK.length).equals(PDF_MARK)) {
    assertPdf(bytes);
    return { mimeType: "application/pdf", extension: ".pdf" };
  }
  const image = imageKind(bytes);
  if (!image) throw new Error(UPLOAD_TYPE_ERROR);
  await assertImage(bytes, image);
  if (image === "jpeg") return { mimeType: "image/jpeg", extension: ".jpg" };
  if (image === "png") return { mimeType: "image/png", extension: ".png" };
  return { mimeType: "image/webp", extension: ".webp" };
}

/** Reject a file whose name or client-supplied type disagrees with the bytes. */
export async function resolveUploadContent(input: {
  bytes: Buffer;
  originalName: string;
  declaredType?: string | null;
}): Promise<DetectedUpload> {
  const detected = await identifyUploadBytes(input.bytes);
  const extension = path.extname(path.basename(input.originalName)).toLowerCase();
  if (extension && !NAME_EXTENSIONS[detected.mimeType].includes(extension)) {
    throw new Error(UPLOAD_MISMATCH_ERROR);
  }
  const declared = claimedMime(input.declaredType);
  if (declared && declared !== detected.mimeType) throw new Error(UPLOAD_MISMATCH_ERROR);
  return detected;
}

function claimedMime(declaredType: string | null | undefined): string | null {
  const base = (declaredType ?? "").split(";")[0].trim().toLowerCase();
  if (!base || base === "application/octet-stream") return null;
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

function assertPdf(bytes: Buffer): void {
  const header = bytes.subarray(0, Math.min(bytes.length, 16)).toString("latin1");
  if (!/^%PDF-[12]\.\d/.test(header)) throw new Error(UPLOAD_MALFORMED_ERROR);
  const eofAt = bytes.lastIndexOf(Buffer.from("%%EOF"));
  if (eofAt < 0) throw new Error(UPLOAD_MALFORMED_ERROR);
  if (!bytes.subarray(0, eofAt).includes(Buffer.from("endobj"))) throw new Error(UPLOAD_MALFORMED_ERROR);
  const trailing = bytes.subarray(eofAt + 5);
  for (const byte of trailing) {
    if (byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x20) {
      throw new Error(UPLOAD_MALFORMED_ERROR);
    }
  }
}

function imageKind(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= PNG_MARK.length && bytes.subarray(0, PNG_MARK.length).equals(PNG_MARK)) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

function assertImageContainer(bytes: Buffer, kind: "jpeg" | "png" | "webp"): void {
  if (kind === "jpeg") {
    if (!bytes.includes(JPEG_EOI)) throw new Error(UPLOAD_MALFORMED_ERROR);
    return;
  }
  if (kind === "png") {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error(UPLOAD_MALFORMED_ERROR);
    if (bytes.length < PNG_IEND.length || !bytes.subarray(bytes.length - PNG_IEND.length).equals(PNG_IEND)) {
      throw new Error(UPLOAD_MALFORMED_ERROR);
    }
    return;
  }
  const size = bytes.readUInt32LE(4);
  if (size < 4 || size + 8 !== bytes.length) throw new Error(UPLOAD_MALFORMED_ERROR);
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk !== "VP8 " && chunk !== "VP8L" && chunk !== "VP8X") throw new Error(UPLOAD_MALFORMED_ERROR);
}

async function assertImage(bytes: Buffer, kind: "jpeg" | "png" | "webp"): Promise<void> {
  assertImageContainer(bytes, kind);
  try {
    const image = sharp(bytes, { failOn: "error" });
    const meta = await image.metadata();
    if (meta.format !== kind || !meta.width || !meta.height) throw new Error(UPLOAD_MALFORMED_ERROR);
    await image.rotate().toBuffer();
  } catch (error) {
    if (error instanceof Error && error.message === UPLOAD_MALFORMED_ERROR) throw error;
    throw new Error(UPLOAD_MALFORMED_ERROR);
  }
}
