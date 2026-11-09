import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishExportFile } from "@/server/jobs/export-file";
import { LeaseLostError } from "@/server/jobs/runner";

const directories: string[] = [];

async function directory(): Promise<string> {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "mp021-export-"));
  directories.push(created);
  return created;
}

describe("export file publish", () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("keeps the published file intact until the completed workbook replaces it", async () => {
    const dir = await directory();
    const name = "15-candidates.xlsx";
    const finalPath = path.join(dir, name);
    await fs.writeFile(finalPath, "old-export");
    let visibleDuringConfirm = "";
    await publishExportFile(dir, name, Buffer.from("new-export"), async () => {
      visibleDuringConfirm = await fs.readFile(finalPath, "utf8");
      return true;
    });
    expect(visibleDuringConfirm).toBe("old-export");
    expect(await fs.readFile(finalPath, "utf8")).toBe("new-export");
    expect(await leftovers(dir)).toEqual([]);
  });

  it("does not replace the published file when the lease is no longer held", async () => {
    const dir = await directory();
    const name = "15-candidates.xlsx";
    const finalPath = path.join(dir, name);
    await fs.writeFile(finalPath, "old-export");
    await expect(publishExportFile(dir, name, Buffer.from("new-export"), async () => false)).rejects.toBeInstanceOf(LeaseLostError);
    expect(await fs.readFile(finalPath, "utf8")).toBe("old-export");
    expect(await leftovers(dir)).toEqual([]);
  });

  it("lets only the lease holder replace the published file", async () => {
    const dir = await directory();
    const name = "15-candidates.xlsx";
    const finalPath = path.join(dir, name);
    await fs.writeFile(finalPath, "old-export");
    const [owned, lost] = await Promise.allSettled([
      publishExportFile(dir, name, Buffer.from("owned-export"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return true;
      }),
      publishExportFile(dir, name, Buffer.from("lost-export"), async () => false),
    ]);
    expect(owned.status).toBe("fulfilled");
    expect(lost.status).toBe("rejected");
    expect(await fs.readFile(finalPath, "utf8")).toBe("owned-export");
    expect(await leftovers(dir)).toEqual([]);
  });

  it("is the export path used by the worker", () => {
    const worker = readFileSync(path.join(process.cwd(), "scripts/jobs/worker.ts"), "utf8");
    expect(worker).toContain("holdLeaseDuring");
    expect(worker).toContain("publishExportFile");
    expect(worker).not.toContain("writeFile");
  });
});

async function leftovers(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir);
  return names.filter((name) => name.includes(".partial") || name.includes(".replacing"));
}
