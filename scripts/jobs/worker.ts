import "dotenv/config";
import path from "node:path";
import { closeDb, pool, prisma } from "@/lib/db";
import type { AccessUser } from "@/lib/auth/permissions";
import { workbookBuffer } from "@/server/exports";
import { publishExportFile } from "@/server/jobs/export-file";
import {
  LeaseLostError,
  createJobStore,
  holdLeaseDuring,
  runExternalEffect,
  runIdempotentInternal,
  runWorkerLoop,
  type ExecuteClaim,
  type JobPool,
  type JobStore,
} from "@/server/jobs/runner";
import { bindWorkerSignals, createWorkerShutdown, runGuardedWorker } from "@/server/jobs/worker-lifecycle";
import { emailIdempotencyKey, exportArtifactName, exportIdempotencyKey, type JobResult } from "@/server/jobs/lifecycle";
import { sendMail } from "@/server/mail";
import { exportRecords, getResource } from "@/server/resources";

async function accessUser(userId: number): Promise<AccessUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roleIdRef: { include: { permissionRoleLinks0: { include: { permissionIdRef: true } } } } },
  });
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    roleName: user.roleIdRef?.name ?? null,
    permissions: user.roleIdRef?.permissionRoleLinks0.map((link) => link.permissionIdRef.key) ?? [],
    agentId: user.agentId,
    subAgentId: user.subAgentId,
    candidateId: user.candidateId,
    agencierId: user.agencierId,
    companierId: user.companierId,
    status: user.status?.trim() || null,
  };
}

async function exportExcel(job: ExecuteClaim, store: JobStore, slug: string): Promise<JobResult> {
  const resource = getResource(slug);
  const user = await accessUser(Number(job.payload.userId));
  if (!resource || !user) throw new Error("Export job is missing a module or user.");
  const rows = await holdLeaseDuring(job, store, () => exportRecords(resource, user, ""));
  const fileName = exportArtifactName(job.id, resource.slug);
  await publishExportFile(path.resolve("data", "exports"), fileName, workbookBuffer(resource, rows), async () => {
    const beat = await store.heartbeat(job);
    if (!beat) return false;
    job.lockedAt = beat;
    return true;
  });
  return { file: fileName, rows: rows.length };
}

async function execute(job: ExecuteClaim, store: JobStore): Promise<JobResult> {
  if (job.type === "send_email") {
    const to = String(job.payload.to ?? "");
    const subject = String(job.payload.subject ?? "MMS");
    const text = String(job.payload.text ?? "");
    return runExternalEffect(job, store, emailIdempotencyKey(job.id), async () => {
      const delivered = await sendMail({ to, subject, text });
      return { delivered };
    });
  }
  if (job.type === "export_excel") {
    const slug = String(job.payload.resource ?? "");
    return runIdempotentInternal(job, store, exportIdempotencyKey(job.id, slug), () => exportExcel(job, store, slug));
  }
  const beat = await store.heartbeat(job);
  if (!beat) throw new LeaseLostError();
  job.lockedAt = beat;
  throw new Error(`Unknown job type ${job.type}`);
}

const shutdown = createWorkerShutdown(() => closeDb());
bindWorkerSignals(process, () => shutdown.requestShutdown(), (code) => {
  process.exit(code);
});

async function main() {
  const once = process.argv.includes("--once");
  const store = createJobStore(pool as unknown as JobPool);
  const loop = runWorkerLoop({ store, execute, once, signal: shutdown.signal });
  await runGuardedWorker(loop, shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "worker failed");
  process.exit(1);
});
