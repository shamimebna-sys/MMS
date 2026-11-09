import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { LeaseLostError } from "@/server/jobs/runner";

/**
 * Writes the workbook beside the published file, then renames it into place.
 * The published file is not opened until the lease is confirmed, so a second
 * worker cannot truncate it while this attempt is still writing.
 */
export async function publishExportFile(
  directory: string,
  fileName: string,
  body: Buffer,
  confirmLease: () => Promise<boolean>,
): Promise<void> {
  if (fileName !== path.basename(fileName) || fileName.includes("..")) throw new Error("Export file name is invalid.");
  await fs.mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, fileName);
  const partialPath = path.join(directory, `.${fileName}.${process.pid}.${randomBytes(4).toString("hex")}.partial`);
  let published = false;
  try {
    await fs.writeFile(partialPath, body);
    if (!(await confirmLease())) throw new LeaseLostError();
    await replaceFile(partialPath, finalPath);
    published = true;
  } finally {
    if (!published) await fs.rm(partialPath, { force: true });
  }
}

async function replaceFile(partialPath: string, finalPath: string): Promise<void> {
  try {
    await fs.rename(partialPath, finalPath);
    return;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EEXIST" && code !== "EPERM") throw error;
  }
  const parked = `${finalPath}.${process.pid}.replacing`;
  await fs.rename(finalPath, parked);
  try {
    await fs.rename(partialPath, finalPath);
  } catch (error) {
    await fs.rename(parked, finalPath).catch(() => undefined);
    throw error;
  }
  await fs.rm(parked, { force: true });
}
