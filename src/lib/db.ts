import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { attachSharedPool, stopPerfRuntime } from "@/server/perf/runtime";

const connectionString = process.env.DATABASE_URL;
const DB_SHUTDOWN_MS = 10_000;

// Process-local. Another Node process does not see these values.
type SharedDbGlobal = typeof globalThis & {
  pool?: Pool;
  prisma?: PrismaClient;
};

const globalForDb = globalThis as SharedDbGlobal;

function createPool(): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const created = new Pool({ connectionString, max: 10 });
  globalForDb.pool = created;
  return created;
}

export const pool = globalForDb.pool ?? createPool();
attachSharedPool(pool);

// adapter-pg nests its own @types/pg. Node resolves one pg module, so this is the same Pool class.
const adapterPool = pool as unknown as ConstructorParameters<typeof PrismaPg>[0];

function createPrismaClient(shared: ConstructorParameters<typeof PrismaPg>[0]): PrismaClient {
  const created = new PrismaClient({
    adapter: new PrismaPg(shared),
  });
  globalForDb.prisma = created;
  return created;
}

export const prisma = globalForDb.prisma ?? createPrismaClient(adapterPool);

let shutdownTask: Promise<void> | undefined;

/**
 * Disconnects Prisma, then ends the shared pool.
 * Prisma 7 does not close an external pool on `$disconnect` unless `disposeExternalPool` is enabled.
 * That option stays off so this helper is the only place that ends the pool.
 */
export function closeDb(): Promise<void> {
  if (shutdownTask) return shutdownTask;
  let resolveShutdown: (() => void) | undefined;
  let rejectShutdown: ((error: unknown) => void) | undefined;
  shutdownTask = new Promise<void>((resolve, reject) => {
    resolveShutdown = resolve;
    rejectShutdown = reject;
  });
  shutdownOnce().then(resolveShutdown, rejectShutdown);
  return shutdownTask;
}

async function shutdownOnce(): Promise<void> {
  stopPerfRuntime();
  let disconnectError: unknown;
  let disconnectSettled = false;
  try {
    await withDeadline(prisma.$disconnect(), DB_SHUTDOWN_MS, "Prisma disconnect");
    disconnectSettled = true;
  } catch (error) {
    disconnectError = error;
    disconnectSettled = !(error instanceof ShutdownTimeoutError);
  }

  let endError: unknown;
  if (disconnectSettled) {
    try {
      await endSharedPool();
    } catch (error) {
      endError = error;
    }
  }

  if (disconnectError) {
    if (endError instanceof Error && disconnectError instanceof Error && disconnectError.cause == null) {
      disconnectError.cause = endError;
    }
    throw disconnectError;
  }
  if (endError) throw endError;
}

async function endSharedPool(): Promise<void> {
  const state = pool as Pool & { ending?: boolean; ended?: boolean };
  if (state.ending || state.ended) return;
  await withDeadline(pool.end(), DB_SHUTDOWN_MS, "PostgreSQL pool close");
}

class ShutdownTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "ShutdownTimeoutError";
  }
}

function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ShutdownTimeoutError(label, ms));
    }, ms);
    timer.unref?.();
  });
  work.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
