import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

function createPool(): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  return new Pool({ connectionString, max: 10 });
}

const globalForDb = globalThis as unknown as { prisma?: PrismaClient; pool?: Pool };

export const pool = globalForDb.pool ?? createPool();

export const prisma =
  globalForDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 10 }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
  globalForDb.prisma = prisma;
}
