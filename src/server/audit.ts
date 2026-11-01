import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export async function writeAudit(entry: {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonValue) : undefined,
      ip: entry.ip ?? null,
    },
  });
}
