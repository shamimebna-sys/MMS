import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";

const UNIT_URL = "postgresql://127.0.0.1:1/mms_pool_unit";
const originalUrl = process.env.DATABASE_URL;
const originalEnv = process.env.NODE_ENV;

type DbModule = {
  pool: Pool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

function clearDbGlobals(): void {
  const globalDb = globalThis as { pool?: Pool; prisma?: PrismaClient };
  delete globalDb.pool;
  delete globalDb.prisma;
}

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function adapterPool(prisma: PrismaClient): Pool | undefined {
  const client = prisma as PrismaClient & { _engineConfig?: { adapter?: { externalPool?: Pool } } };
  return client._engineConfig?.adapter?.externalPool;
}

async function loadDb(): Promise<DbModule> {
  clearDbGlobals();
  vi.resetModules();
  process.env.DATABASE_URL = UNIT_URL;
  setNodeEnv("development");
  return import("@/lib/db");
}

beforeEach(() => {
  clearDbGlobals();
  vi.resetModules();
  process.env.DATABASE_URL = UNIT_URL;
  setNodeEnv("development");
});

afterEach(() => {
  vi.useRealTimers();
  clearDbGlobals();
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  setNodeEnv(originalEnv);
});

describe("shared PostgreSQL pool", () => {
  it("gives Prisma the same pool and keeps the maximum at 10", async () => {
    const db = await loadDb();
    expect(adapterPool(db.prisma)).toBe(db.pool);
    expect(db.pool.options.max).toBe(10);
    await db.closeDb();
  });

  it("reuses one pool when the module is evaluated again during development", async () => {
    clearDbGlobals();
    vi.resetModules();
    process.env.DATABASE_URL = UNIT_URL;
    setNodeEnv("development");
    const first = await import("@/lib/db");
    vi.resetModules();
    const second = await import("@/lib/db");
    expect(second.pool).toBe(first.pool);
    expect(second.prisma).toBe(first.prisma);
    expect(adapterPool(second.prisma)).toBe(first.pool);
    expect(second.pool.options.max).toBe(10);
    await second.closeDb();
  });

  it("disconnects Prisma before ending the pool", async () => {
    const db = await loadDb();
    const order: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(db.prisma, "$disconnect").mockImplementation(async () => {
      order.push("disconnect-start");
      await gate;
      order.push("disconnect-end");
    });
    vi.spyOn(db.pool, "end").mockImplementation(async () => {
      order.push("end");
    });
    const pending = db.closeDb();
    await Promise.resolve();
    expect(order).toEqual(["disconnect-start"]);
    release?.();
    await pending;
    expect(order).toEqual(["disconnect-start", "disconnect-end", "end"]);
  });

  it("is safe to call closeDb more than once", async () => {
    const db = await loadDb();
    const disconnect = vi.spyOn(db.prisma, "$disconnect").mockResolvedValue(undefined);
    const end = vi.spyOn(db.pool, "end").mockResolvedValue();
    await db.closeDb();
    await db.closeDb();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("reports the original shutdown error without closing twice", async () => {
    const db = await loadDb();
    const disconnectError = new Error("disconnect failed");
    const disconnect = vi.spyOn(db.prisma, "$disconnect").mockRejectedValue(disconnectError);
    const end = vi.spyOn(db.pool, "end").mockRejectedValue(new Error("end failed"));
    await expect(db.closeDb()).rejects.toBe(disconnectError);
    await expect(db.closeDb()).rejects.toBe(disconnectError);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(disconnectError.cause).toBeInstanceOf(Error);
    end.mockRestore();
    await db.pool.end();
  });

  it("does not end the pool when Prisma disconnect does not finish", async () => {
    const db = await loadDb();
    vi.useFakeTimers();
    const disconnect = vi.spyOn(db.prisma, "$disconnect").mockImplementation(() => new Promise(() => undefined));
    const end = vi.spyOn(db.pool, "end").mockResolvedValue();
    const pending = db.closeDb();
    const assertion = expect(pending).rejects.toThrow("Prisma disconnect timed out after 10000ms");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    await expect(db.closeDb()).rejects.toThrow("Prisma disconnect timed out after 10000ms");
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
    vi.useRealTimers();
    end.mockRestore();
    await db.pool.end();
  });
});
