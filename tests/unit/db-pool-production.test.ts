import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolConfig } from "pg";
import type { PrismaClient } from "@/generated/prisma/client";

const UNIT_URL = "postgresql://127.0.0.1:1/mms_pool_unit";
const originalUrl = process.env.DATABASE_URL;
const originalEnv = process.env.NODE_ENV;
const foreignMarker = "__mp022kForeignMarker";

type EndablePool = Pool & { ending?: boolean; ended?: boolean };

type DbModule = {
  pool: EndablePool;
  prisma: PrismaClient;
  closeDb: () => Promise<void>;
};

const state = vi.hoisted(() => ({
  pools: [] as EndablePool[],
  clients: [] as PrismaClient[],
  adapterArgs: [] as unknown[][],
}));

vi.mock("pg", async () => {
  const actual = await vi.importActual<typeof import("pg")>("pg");

  class CountingPool extends actual.Pool {
    constructor(config?: PoolConfig) {
      super(config);
      state.pools.push(this);
    }
  }

  const mocked = { ...actual, Pool: CountingPool };
  return { ...mocked, default: mocked };
});

vi.mock("@prisma/adapter-pg", async () => {
  const actual = await vi.importActual<typeof import("@prisma/adapter-pg")>("@prisma/adapter-pg");

  class CountingPrismaPg extends actual.PrismaPg {
    constructor(...args: ConstructorParameters<typeof actual.PrismaPg>) {
      super(...args);
      state.adapterArgs.push(args);
    }
  }

  return { ...actual, PrismaPg: CountingPrismaPg };
});

vi.mock("@/generated/prisma/client", async () => {
  const actual = await vi.importActual<typeof import("@/generated/prisma/client")>("@/generated/prisma/client");
  const ActualClient = actual.PrismaClient;

  function CountingPrismaClient(
    this: PrismaClient,
    ...args: ConstructorParameters<typeof ActualClient>
  ): PrismaClient {
    const client = new ActualClient(...args);
    state.clients.push(client);
    return client;
  }

  return { ...actual, PrismaClient: CountingPrismaClient as unknown as typeof ActualClient };
});

function globalDb(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

function clearOwnDbGlobals(): void {
  const bag = globalDb();
  delete bag.pool;
  delete bag.prisma;
}

async function endPool(pool: EndablePool | undefined): Promise<void> {
  if (!pool) return;
  const end = pool.end as typeof pool.end & { mockRestore?: () => void };
  if (typeof end.mockRestore === "function") end.mockRestore();
  if (pool.ending || pool.ended) return;
  await pool.end();
}

function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function restoreEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  if (originalUrl === undefined) delete env.DATABASE_URL;
  else env.DATABASE_URL = originalUrl;
  setNodeEnv(originalEnv);
}

function adapterPool(prisma: PrismaClient): Pool | undefined {
  const client = prisma as PrismaClient & { _engineConfig?: { adapter?: { externalPool?: Pool } } };
  return client._engineConfig?.adapter?.externalPool;
}

function adapterOptions(prisma: PrismaClient): { disposeExternalPool?: boolean } | undefined {
  const client = prisma as PrismaClient & {
    _engineConfig?: { adapter?: { options?: { disposeExternalPool?: boolean } } };
  };
  return client._engineConfig?.adapter?.options;
}

beforeEach(() => {
  state.pools.length = 0;
  state.clients.length = 0;
  state.adapterArgs.length = 0;
  clearOwnDbGlobals();
  process.env.DATABASE_URL = UNIT_URL;
  setNodeEnv("production");
  vi.resetModules();
});

afterEach(async () => {
  const bag = globalDb();
  await endPool(bag.pool as EndablePool | undefined);
  clearOwnDbGlobals();
  delete bag[foreignMarker];
  restoreEnv();
});

describe("production database singleton", () => {
  it("reuses one pool and one Prisma client across independent module evaluations", async () => {
    expect(process.env.NODE_ENV).toBe("production");

    const first = (await import("@/lib/db")) as DbModule;
    vi.resetModules();
    const second = (await import("@/lib/db")) as DbModule;

    expect(second.closeDb).not.toBe(first.closeDb);
    expect(second.pool).toBe(first.pool);
    expect(second.prisma).toBe(first.prisma);
    expect(globalDb().pool).toBe(first.pool);
    expect(globalDb().prisma).toBe(first.prisma);
    expect(state.pools).toEqual([first.pool]);
    expect(state.clients).toEqual([first.prisma]);
    expect(first.pool.options.max).toBe(10);
    expect(state.adapterArgs).toHaveLength(1);
    expect(state.adapterArgs[0]?.[0]).toBe(first.pool);
    expect(state.adapterArgs[0]?.[1]).toBeUndefined();
    expect(adapterPool(first.prisma)).toBe(first.pool);
    expect(adapterPool(second.prisma)).toBe(first.pool);
    expect(adapterOptions(first.prisma)?.disposeExternalPool).not.toBe(true);

    const endDuringDisconnect = vi.spyOn(first.pool, "end");
    await first.prisma.$connect();
    await first.prisma.$disconnect();
    expect(endDuringDisconnect).not.toHaveBeenCalled();
    expect(first.pool.ended).not.toBe(true);
    endDuringDisconnect.mockRestore();

    const constructed = state.pools.length;
    const disconnect = vi.spyOn(first.prisma, "$disconnect").mockResolvedValue(undefined);
    const end = vi.spyOn(first.pool, "end").mockResolvedValue();
    await first.closeDb();
    await first.closeDb();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(state.pools).toHaveLength(constructed);
    end.mockRestore();

    vi.resetModules();
    const third = (await import("@/lib/db")) as DbModule;
    expect(third.pool).toBe(first.pool);
    expect(third.prisma).toBe(first.prisma);
    expect(state.pools).toHaveLength(1);
    expect(state.clients).toHaveLength(1);
    expect(state.adapterArgs).toHaveLength(1);
  });

  it("removes only the singleton globals and restores the environment", async () => {
    const bag = globalDb();
    bag[foreignMarker] = "keep";
    const db = (await import("@/lib/db")) as DbModule;
    expect(process.env.NODE_ENV).toBe("production");
    expect(bag.pool).toBe(db.pool);
    expect(bag.prisma).toBe(db.prisma);

    await endPool(db.pool);
    clearOwnDbGlobals();
    restoreEnv();

    expect(bag.pool).toBeUndefined();
    expect(bag.prisma).toBeUndefined();
    expect(bag[foreignMarker]).toBe("keep");
    expect(process.env.NODE_ENV).toBe(originalEnv);
    expect(process.env.DATABASE_URL).toBe(originalUrl);
    delete bag[foreignMarker];
  });
});
