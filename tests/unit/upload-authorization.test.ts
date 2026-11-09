import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { AccessUser } from "@/lib/auth/permissions";
import type { PreparedProfileImage } from "@/server/profile-image";

type StoredRow = {
  id: string;
  storagePath: string;
  originalName: string;
  ownerTable: string | null;
  ownerId: string | null;
  createdBy: number | null;
  mimeType: string;
};

const mocks = vi.hoisted(() => {
  let createError: Error | null = null;
  const events: string[] = [];
  const rows = new Map<string, StoredRow>();
  const files = {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (_filePath: string, _bytes: Buffer, _options: { mode: number }) => {
      events.push("write");
    }),
    unlink: vi.fn(async (_filePath: string) => undefined),
  };
  return {
    events,
    rows,
    files,
    query: vi.fn(),
    writeAudit: vi.fn(async () => undefined),
    getCurrentUser: vi.fn(),
    requireUser: vi.fn(),
    requestIp: vi.fn(async () => null),
    paymentCreate: vi.fn(),
    paymentFindFirst: vi.fn(),
    paymentFindUnique: vi.fn(async () => null),
    setCreateError(error: Error | null) {
      createError = error;
    },
    storedFileCreate: vi.fn(async ({ data }: { data: StoredRow }) => {
      if (createError) throw createError;
      rows.set(data.id, data);
      return data;
    }),
  };
});

vi.mock("node:fs/promises", () => ({
  default: mocks.files,
}));

vi.mock("@/server/audit", () => ({
  writeAudit: mocks.writeAudit,
}));

vi.mock("@/server/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireUser: mocks.requireUser,
  requestIp: mocks.requestIp,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/db", () => ({
  pool: { query: mocks.query },
  prisma: {
    storedFile: {
      create: mocks.storedFileCreate,
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.rows.get(where.id) ?? null),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = mocks.rows.get(where.id) ?? null;
        mocks.rows.delete(where.id);
        return row;
      }),
    },
    payment: {
      create: mocks.paymentCreate,
      findFirst: mocks.paymentFindFirst,
      findUnique: mocks.paymentFindUnique,
    },
  },
}));

import { POST } from "@/app/api/uploads/route";
import { saveWalletPayment } from "@/app/(workspace)/wallet/actions";
import { submitBreadForm } from "@/server/bread-form";
import { UPLOAD_MALFORMED_ERROR, UPLOAD_MISMATCH_ERROR } from "@/server/upload-content";
import { storePreparedProfileImage, storeUpload } from "@/server/uploads";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
let insertError: Error | null = null;

function user(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: 7,
    name: "Staff",
    roleName: "Employee",
    permissions: [],
    agentId: null,
    subAgentId: null,
    candidateId: null,
    agencierId: null,
    companierId: null,
    status: "A",
    ...overrides,
  };
}

function pdfFile(name = "passport.pdf"): File {
  return new File([new Uint8Array(pdf)], name, { type: "application/pdf" });
}

async function raster(format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  const image = sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } });
  if (format === "jpeg") return image.jpeg().toBuffer();
  if (format === "png") return image.png().toBuffer();
  return image.webp().toBuffer();
}

function uploadFile(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function breadForm(fields: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

function compact(sql: unknown): string {
  return String(sql).replace(/\s+/g, " ").trim();
}

function writtenPath(): string {
  const filePath = mocks.files.writeFile.mock.calls[0]?.[0];
  if (typeof filePath !== "string") throw new Error("file was not written");
  return filePath;
}

function storedRows(): StoredRow[] {
  return [...mocks.rows.values()];
}

beforeEach(() => {
  insertError = null;
  mocks.events.length = 0;
  mocks.rows.clear();
  mocks.setCreateError(null);
  mocks.files.mkdir.mockReset();
  mocks.files.mkdir.mockResolvedValue(undefined);
  mocks.files.writeFile.mockReset();
  mocks.files.writeFile.mockImplementation(async () => {
    mocks.events.push("write");
  });
  mocks.files.unlink.mockReset();
  mocks.files.unlink.mockResolvedValue(undefined);
  mocks.storedFileCreate.mockClear();
  mocks.writeAudit.mockReset();
  mocks.writeAudit.mockResolvedValue(undefined);
  mocks.getCurrentUser.mockReset();
  mocks.requireUser.mockReset();
  mocks.paymentCreate.mockReset();
  mocks.paymentFindFirst.mockReset();
  mocks.paymentFindUnique.mockReset();
  mocks.paymentCreate.mockResolvedValue({ id: 5 });
  mocks.paymentFindUnique.mockResolvedValue(null);
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: unknown, params: unknown[] = []) => {
    const statement = compact(sql);
    if (statement.includes("FROM data_types")) {
      const slug = String(params[0] ?? "");
      if (slug === "candidates") {
        return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
      }
      if (slug === "medicals") {
        return { rows: [{ id: 3, slug: "medicals", name: "medicals", display_name_singular: "Medical" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (statement.includes("FROM data_rows")) {
      return {
        rows: [
          { field: "name", type: "text", display_name: "Name", required: 1, details: null },
          { field: "passport_file_path", type: "file", display_name: "Passport", required: 0, details: null },
        ],
        rowCount: 2,
      };
    }
    if (statement.includes("information_schema.columns")) {
      const requested = Array.isArray(params[0]) ? params[0].map(String) : [String(params[0] ?? "")];
      const columns = [
        ["id", "integer"],
        ["name", "character varying"],
        ["passport_file_path", "text"],
        ["agent_id", "integer"],
        ["updated_at", "timestamp with time zone"],
        ["created_at", "timestamp with time zone"],
      ];
      const rows = requested.flatMap((table_name) => columns.map(([column_name, data_type]) => ({ table_name, column_name, data_type })));
      return { rows, rowCount: rows.length };
    }
    if (/^insert\b/i.test(statement)) {
      mocks.events.push("insert");
      if (insertError) throw insertError;
      return { rows: [{ id: 41 }], rowCount: 1 };
    }
    if (/^update\b/i.test(statement)) {
      mocks.events.push("update");
      return { rows: [], rowCount: 1 };
    }
    if (statement.includes('FROM "candidates"') || statement.includes('FROM "medicals"')) {
      if (statement.includes("FALSE")) return { rows: [], rowCount: 0 };
      const requested = Number(params[0]);
      const inScope = statement.includes("TRUE") || params.includes(4);
      if (requested === 9 && inScope) {
        if (statement.includes("SELECT 1")) return { rows: [{ ok: 1 }], rowCount: 1 };
        return {
          rows: [{ id: "9", name: "Amina", passport_file_path: "", agent_id: "4", updated_at: "", created_at: "" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe("record upload authorization", () => {
  it("does not store a file when the user cannot save the module", async () => {
    await expect(
      submitBreadForm(
        user(),
        breadForm({ slug: "candidates", name: "Amina", passport_file_path: pdfFile() }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();
    expect(mocks.events).not.toContain("insert");
  });

  it("does not store a file for a record id outside the caller's scope", async () => {
    const otherAgent = user({ id: 3, roleName: "Agent", agentId: 8, permissions: ["edit_candidates"] });
    await expect(
      submitBreadForm(
        otherAgent,
        breadForm({ slug: "candidates", id: "9", name: "Amina", passport_file_path: pdfFile() }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some((call) => compact(call[0]).includes("SELECT 1"))).toBe(false);
  });

  it("does not treat edit permission as access to every candidate", async () => {
    const employee = user({ permissions: ["edit_candidates"] });
    await expect(
      submitBreadForm(
        employee,
        breadForm({ slug: "candidates", id: "9", name: "Amina", passport_file_path: pdfFile() }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some((call) => compact(String(call[0])).includes("SELECT 1"))).toBe(false);
  });

  it("does not let an agent create a candidate or store a passport for one", async () => {
    const agent = user({ id: 2, roleName: "Agent", agentId: 4, permissions: ["add_candidates"] });
    await expect(
      submitBreadForm(
        agent,
        breadForm({ slug: "candidates", name: "New Candidate", passport_file_path: pdfFile() }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.events).not.toContain("insert");
  });

  it("does not let an agent edit a candidate by stored grant or by id", async () => {
    const agent = user({ id: 2, roleName: "Agent", agentId: 4, permissions: ["edit_candidates"] });
    await expect(
      submitBreadForm(
        agent,
        breadForm({ slug: "candidates", id: "9", name: "Amina", passport_file_path: pdfFile("../../passport.pdf") }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.events).not.toContain("update");
  });

  it("removes the new file when the record insert fails", async () => {
    insertError = new Error("insert failed");
    const admin = user({ id: 1, roleName: "admin" });
    await expect(
      submitBreadForm(admin, breadForm({ slug: "candidates", name: "Amina", passport_file_path: pdfFile() }), null),
    ).rejects.toThrow("insert failed");
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.files.unlink).toHaveBeenCalledWith(writtenPath());
    expect(mocks.rows.size).toBe(0);
  });

  it("removes a stored file when later validation rejects an authorized save", async () => {
    const admin = user({ id: 1, roleName: "admin" });
    await expect(
      submitBreadForm(admin, breadForm({ slug: "candidates", passport_file_path: pdfFile() }), null),
    ).rejects.toThrow("Name is required.");
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.files.unlink).toHaveBeenCalledWith(writtenPath());
    expect(mocks.rows.size).toBe(0);
    expect(mocks.events).not.toContain("insert");
  });

  it("keeps the file when the record row committed and a later audit write fails", async () => {
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit failed"));
    const admin = user({ id: 1, roleName: "admin" });
    await expect(
      submitBreadForm(admin, breadForm({ slug: "candidates", name: "Amina", passport_file_path: pdfFile() }), null),
    ).rejects.toThrow("audit failed");
    expect(mocks.files.unlink).not.toHaveBeenCalled();
    expect(mocks.rows.size).toBe(1);
  });
});

describe("upload API", () => {
  async function post(fields: Record<string, string | File>, actor: AccessUser | null) {
    mocks.getCurrentUser.mockResolvedValue(actor);
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return POST(new Request("http://localhost/api/uploads", { method: "POST", body: form }));
  }

  it("rejects a signed-out caller before writing", async () => {
    const response = await post({ ownerTable: "candidates", ownerId: "9", file: pdfFile() }, null);
    expect(response.status).toBe(401);
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a forged record id before writing", async () => {
    const agent = user({ id: 2, roleName: "Agent", agentId: 4, permissions: ["edit_candidates"] });
    const response = await post({ ownerTable: "candidates", ownerId: "9 OR 1=1", file: pdfFile() }, agent);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("You cannot edit this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects an upload aimed at another agent's candidate", async () => {
    const agent = user({ id: 3, roleName: "Agent", agentId: 8, permissions: ["edit_candidates"] });
    const response = await post({ ownerTable: "candidates", ownerId: "9", file: pdfFile() }, agent);
    expect(response.status).toBe(403);
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();
  });

  it("rejects a module the caller cannot add to", async () => {
    const agent = user({ id: 2, roleName: "Agent", agentId: 4, permissions: [] });
    const response = await post({ ownerTable: "medicals", file: pdfFile() }, agent);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("You cannot save this record.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
  });

  it("stores a file for a candidate an authorized role can edit", async () => {
    const admin = user({ id: 1, roleName: "admin", permissions: [] });
    const response = await post({ ownerTable: "candidates", ownerId: "9", file: pdfFile("scan.pdf") }, admin);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toMatch(/^[a-f0-9]{32}$/);
    expect(storedRows()[0]).toEqual(
      expect.objectContaining({ id: body.id, ownerTable: "candidates", ownerId: "9", createdBy: 1, originalName: "scan.pdf" }),
    );
    const scopeQuery = mocks.query.mock.calls.find((call) => compact(call[0]).includes("SELECT 1"));
    expect(scopeQuery?.[1]).toEqual([9]);
  });

  it("rejects a forged MIME type after authorization and does not write", async () => {
    const admin = user({ id: 1, roleName: "admin" });
    const response = await post({ ownerTable: "candidates", file: uploadFile(pdf, "scan.pdf", "image/jpeg") }, admin);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe(UPLOAD_MISMATCH_ERROR);
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();
  });

  it("stores a JPEG when the name and client type match the bytes", async () => {
    const admin = user({ id: 1, roleName: "admin" });
    const jpeg = await raster("jpeg");
    const response = await post({ ownerTable: "candidates", file: uploadFile(jpeg, "photo.jpg", "image/jpeg") }, admin);
    expect(response.status).toBe(200);
    expect(mocks.files.writeFile.mock.calls[0]?.[1]).toEqual(jpeg);
    expect(storedRows()[0]?.mimeType).toBe("image/jpeg");
    expect(mocks.files.unlink).not.toHaveBeenCalled();
  });

  it("still rejects an empty file after authorization", async () => {
    const admin = user({ id: 1, roleName: "admin" });
    const response = await post({ ownerTable: "candidates", file: new File([], "empty.pdf", { type: "application/pdf" }) }, admin);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("File must be between 1 byte and 8 MB.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
  });
});

describe("upload validation and storage cleanup", () => {
  it("keeps the size limit and does not write an oversized file", async () => {
    await expect(storeUpload({ bytes: Buffer.alloc(0), originalName: "empty.pdf", createdBy: 1 })).rejects.toThrow(
      "File must be between 1 byte and 8 MB.",
    );
    await expect(
      storeUpload({ bytes: Buffer.alloc(8 * 1024 * 1024 + 1), originalName: "big.pdf", createdBy: 1 }),
    ).rejects.toThrow("File must be between 1 byte and 8 MB.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
  });

  it("accepts a PDF and a PNG, and rejects other contents before writing", async () => {
    await storeUpload({ bytes: pdf, originalName: "../../etc/passport.pdf", createdBy: 1 });
    expect(storedRows()[0]?.originalName).toBe("passport.pdf");
    expect(storedRows()[0]?.mimeType).toBe("application/pdf");

    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    mocks.rows.clear();
    await storeUpload({ bytes: png, originalName: "photo.png", createdBy: 1 });
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(2);
    expect(storedRows()[0]?.mimeType).toBe("image/png");
    expect(mocks.files.writeFile.mock.calls[1]?.[1]).toEqual(png);

    await expect(storeUpload({ bytes: Buffer.from("hello"), originalName: "notes.txt", createdBy: 1 })).rejects.toThrow();
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    await expect(storeUpload({ bytes: gif, originalName: "anim.gif", createdBy: 1 })).rejects.toThrow(
      "Upload a PDF or a JPEG, PNG, or WebP image.",
    );
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(2);
  });

  it("deletes the new file when the stored-file row cannot be saved", async () => {
    mocks.setCreateError(new Error("database down"));
    await expect(storeUpload({ bytes: pdf, originalName: "a.pdf", createdBy: 1 })).rejects.toThrow("database down");
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.files.unlink).toHaveBeenCalledWith(writtenPath());
    expect(mocks.rows.size).toBe(0);
  });

  it("keeps profile image checks and removes a profile file when its row cannot be saved", async () => {
    await expect(
      storePreparedProfileImage({
        prepared: { bytes: Buffer.from("gif"), mimeType: "image/gif", extension: ".gif" } as unknown as PreparedProfileImage,
        createdBy: 1,
        ownerId: "1",
      }),
    ).rejects.toThrow("Upload a JPEG, PNG, or WebP image.");
    await expect(
      storePreparedProfileImage({
        prepared: { bytes: Buffer.alloc(0), mimeType: "image/png", extension: ".png" },
        createdBy: 1,
        ownerId: "1",
      }),
    ).rejects.toThrow("Image must be between 1 byte and 5 MB.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();

    await expect(
      storePreparedProfileImage({
        prepared: { bytes: Buffer.from("png-bytes"), mimeType: "image/png", extension: ".png" },
        createdBy: 1,
        ownerId: "1",
      }),
    ).rejects.toThrow("Upload a JPEG, PNG, or WebP image.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();

    mocks.setCreateError(new Error("database down"));
    const png = await raster("png");
    await expect(
      storePreparedProfileImage({
        prepared: { bytes: png, mimeType: "image/png", extension: ".png" },
        createdBy: 1,
        ownerId: "1",
      }),
    ).rejects.toThrow("database down");
    expect(mocks.files.unlink).toHaveBeenCalledWith(writtenPath());
    expect(mocks.rows.size).toBe(0);
  });
});

describe("upload content must match the file", () => {
  function expectUnstored(): void {
    expect(mocks.files.mkdir).not.toHaveBeenCalled();
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.storedFileCreate).not.toHaveBeenCalled();
    expect(mocks.rows.size).toBe(0);
  }

  it("rejects a PDF renamed with an image extension before writing", async () => {
    await expect(
      storeUpload({ bytes: pdf, originalName: "photo.jpg", declaredType: "application/pdf", createdBy: 1 }),
    ).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    expectUnstored();
  });

  it("rejects an image renamed with a PDF extension before writing", async () => {
    const jpeg = await raster("jpeg");
    await expect(
      storeUpload({ bytes: jpeg, originalName: "scan.pdf", declaredType: "image/jpeg", createdBy: 1 }),
    ).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    expectUnstored();
  });

  it("rejects a forged client MIME type before writing", async () => {
    const jpeg = await raster("jpeg");
    await expect(
      storeUpload({ bytes: jpeg, originalName: "photo.jpg", declaredType: "application/pdf", createdBy: 1 }),
    ).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    await expect(
      storeUpload({ bytes: pdf, originalName: "scan.pdf", declaredType: "image/png", createdBy: 1 }),
    ).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    expectUnstored();
  });

  it("rejects truncated and malformed files before writing", async () => {
    await expect(
      storeUpload({ bytes: Buffer.from("%PDF-1.4"), originalName: "cut.pdf", declaredType: "application/pdf", createdBy: 1 }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    await expect(
      storeUpload({
        bytes: Buffer.from("%PDF-1.4\n%%EOF\n"),
        originalName: "empty.pdf",
        declaredType: "application/pdf",
        createdBy: 1,
      }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    const jpeg = await raster("jpeg");
    await expect(
      storeUpload({
        bytes: jpeg.subarray(0, Math.floor(jpeg.length / 2)),
        originalName: "cut.jpg",
        declaredType: "image/jpeg",
        createdBy: 1,
      }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    const png = await raster("png");
    await expect(
      storeUpload({
        bytes: Buffer.concat([png.subarray(0, 8), Buffer.alloc(32)]),
        originalName: "cut.png",
        declaredType: "image/png",
        createdBy: 1,
      }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    const webp = await raster("webp");
    await expect(
      storeUpload({
        bytes: webp.subarray(0, Math.floor(webp.length / 2)),
        originalName: "cut.webp",
        declaredType: "image/webp",
        createdBy: 1,
      }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    await expect(
      storeUpload({
        bytes: Buffer.concat([pdf, Buffer.from("<html>not a pdf</html>")]),
        originalName: "poly.pdf",
        declaredType: "application/pdf",
        createdBy: 1,
      }),
    ).rejects.toThrow(UPLOAD_MALFORMED_ERROR);
    expectUnstored();
  });

  it("stores valid PDF, JPEG, PNG, and WebP bytes unchanged", async () => {
    await storeUpload({ bytes: pdf, originalName: "passport.pdf", declaredType: "application/pdf", createdBy: 1 });
    const jpeg = await raster("jpeg");
    await storeUpload({ bytes: jpeg, originalName: "photo.jpeg", declaredType: "image/jpg", createdBy: 1 });
    const png = await raster("png");
    await storeUpload({ bytes: png, originalName: "photo.png", declaredType: "image/png", createdBy: 1 });
    const webp = await raster("webp");
    await storeUpload({ bytes: webp, originalName: "photo.webp", declaredType: "image/webp", createdBy: 1 });

    expect(mocks.files.writeFile).toHaveBeenCalledTimes(4);
    expect(mocks.files.writeFile.mock.calls.map((call) => call[1])).toEqual([pdf, jpeg, png, webp]);
    expect(mocks.files.writeFile.mock.calls.every((call) => call[2]?.mode === 0o600)).toBe(true);
    expect(storedRows().map((row) => row.mimeType)).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    expect(storedRows().map((row) => row.storagePath.replace(/^[a-f0-9]{32}/, ""))).toEqual([".pdf", ".jpg", ".png", ".webp"]);
    expect(mocks.files.unlink).not.toHaveBeenCalled();
  });

  it("does not store a mismatched file when the record save is not allowed", async () => {
    await expect(
      submitBreadForm(
        user(),
        breadForm({ slug: "candidates", name: "Amina", passport_file_path: uploadFile(pdf, "photo.jpg", "image/jpeg") }),
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expectUnstored();
    expect(mocks.events).not.toContain("insert");
  });

  it("does not store a renamed PDF submitted on a record the caller can save", async () => {
    const admin = user({ id: 1, roleName: "admin" });
    await expect(
      submitBreadForm(
        admin,
        breadForm({ slug: "candidates", name: "Amina", passport_file_path: uploadFile(pdf, "photo.jpg", "application/pdf") }),
        null,
      ),
    ).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    expectUnstored();
    expect(mocks.events).not.toContain("insert");
  });
});

describe("wallet cheque upload", () => {
  function paymentForm(file?: File): FormData {
    const form = new FormData();
    form.set("amount", "25");
    form.set("currency_id", "2");
    form.set("payment_method", "CHEQUE");
    form.set("invoice_no", "INV-1");
    form.set("agent_id", "999");
    if (file) form.set("cheque_file_path", file);
    return form;
  }

  function createdPayment(): { agentId: number | null; subAgentId: number; chequeFilePath: string | null } {
    const call = mocks.paymentCreate.mock.calls[0]?.[0] as
      | { data: { agentId: number | null; subAgentId: number; chequeFilePath: string | null } }
      | undefined;
    if (!call) throw new Error("payment was not created");
    return call.data;
  }

  it("does not store a cheque for an account that cannot add a wallet payment", async () => {
    mocks.requireUser.mockResolvedValue(user());
    await expect(saveWalletPayment(paymentForm(pdfFile("cheque.pdf")))).rejects.toThrow(
      "REDIRECT:/wallet?error=You cannot add a wallet payment.",
    );
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it("does not store a cheque when the payment fields are invalid", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 2, roleName: "Agent", agentId: 4 }));
    const form = paymentForm(pdfFile("cheque.pdf"));
    form.set("amount", "0");
    await expect(saveWalletPayment(form)).rejects.toThrow("REDIRECT:/wallet?error=Enter an amount greater than zero.");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
  });

  it("stores a cheque for the signed-in agent and ignores a submitted agent id", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 2, roleName: "Agent", agentId: 4 }));
    await expect(saveWalletPayment(paymentForm(pdfFile("cheque.pdf")))).rejects.toThrow("REDIRECT:/wallet?saved=1");
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.files.unlink).not.toHaveBeenCalled();
    expect(createdPayment().agentId).toBe(4);
    expect(createdPayment().chequeFilePath).toMatch(/^\/api\/files\/[a-f0-9]{32}$/);
    expect(storedRows()[0]).toEqual(expect.objectContaining({ ownerTable: "payments", createdBy: 2, originalName: "cheque.pdf" }));
  });

  it("saves a sub-agent payment that has no cheque", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 6, roleName: "Sub Agent", subAgentId: 11 }));
    await expect(saveWalletPayment(paymentForm())).rejects.toThrow("REDIRECT:/wallet?saved=1");
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(createdPayment()).toMatchObject({ subAgentId: 11, chequeFilePath: null });
  });

  it("removes the cheque when the payment row cannot be saved", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 2, roleName: "Agent", agentId: 4 }));
    mocks.paymentCreate.mockRejectedValueOnce(new Error("database down"));
    await expect(saveWalletPayment(paymentForm(pdfFile("cheque.pdf")))).rejects.toThrow("database down");
    expect(mocks.files.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.files.unlink).toHaveBeenCalledWith(writtenPath());
    expect(mocks.rows.size).toBe(0);
  });

  it("rejects a cheque whose client type does not match the bytes", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 2, roleName: "Agent", agentId: 4 }));
    const jpeg = await raster("jpeg");
    const form = paymentForm(uploadFile(jpeg, "cheque.jpg", "application/pdf"));
    await expect(saveWalletPayment(form)).rejects.toThrow(UPLOAD_MISMATCH_ERROR);
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it("rejects a cheque that is not a PDF or an allowed image", async () => {
    mocks.requireUser.mockResolvedValue(user({ id: 2, roleName: "Agent", agentId: 4 }));
    const form = paymentForm(new File([Buffer.from("hello")], "cheque.txt", { type: "text/plain" }));
    await expect(saveWalletPayment(form)).rejects.toThrow();
    expect(mocks.files.writeFile).not.toHaveBeenCalled();
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });
});
