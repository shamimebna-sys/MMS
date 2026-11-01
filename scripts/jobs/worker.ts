import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { pool, prisma } from "@/lib/db";
import type { AccessUser } from "@/lib/auth/permissions";
import { workbookBuffer } from "@/server/exports";
import { sendMail } from "@/server/mail";
import { exportRecords, getResource } from "@/server/resources";

type JobRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

async function claimJob(): Promise<JobRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH next_job AS (
         SELECT id FROM jobs
         WHERE status = 'queued' AND run_after <= NOW()
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE jobs
       SET status = 'running', locked_at = NOW(), attempts = attempts + 1, updated_at = NOW()
       WHERE id IN (SELECT id FROM next_job)
       RETURNING id::text, type, payload, attempts, max_attempts`,
    );
    await client.query("COMMIT");
    return (result.rows[0] as JobRow | undefined) ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

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

async function runJob(job: JobRow): Promise<Record<string, unknown>> {
  if (job.type === "send_email") {
    const to = String(job.payload.to ?? "");
    const subject = String(job.payload.subject ?? "MMS");
    const text = String(job.payload.text ?? "");
    const delivered = await sendMail({ to, subject, text });
    return { delivered };
  }
  if (job.type === "export_excel") {
    const resource = getResource(String(job.payload.resource ?? ""));
    const user = await accessUser(Number(job.payload.userId));
    if (!resource || !user) throw new Error("Export job is missing a module or user.");
    const rows = await exportRecords(resource, user, "");
    const dir = path.resolve("data", "exports");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${job.id}-${resource.slug}.xlsx`);
    await fs.writeFile(file, workbookBuffer(resource, rows));
    return { file: path.basename(file), rows: rows.length };
  }
  throw new Error(`Unknown job type ${job.type}`);
}

async function finish(job: JobRow, result: Record<string, unknown> | null, error: string | null) {
  const failed = Boolean(error);
  const retry = failed && job.attempts < job.max_attempts;
  await pool.query(
    `UPDATE jobs
     SET status = $2, result = $3::jsonb, last_error = $4, run_after = CASE WHEN $5 THEN NOW() + INTERVAL '1 minute' ELSE run_after END, updated_at = NOW()
     WHERE id = $1`,
    [job.id, retry ? "queued" : failed ? "failed" : "done", result ? JSON.stringify(result) : null, error, retry],
  );
}

async function tick() {
  const job = await claimJob();
  if (!job) return false;
  try {
    const result = await runJob(job);
    await finish(job, result, null);
    console.log(`job ${job.id} ${job.type} done`);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "job_failed";
    await finish(job, null, message);
    console.log(`job ${job.id} ${job.type} error`);
  }
  return true;
}

async function main() {
  const once = process.argv.includes("--once");
  do {
    const worked = await tick();
    if (once) break;
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (!once);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "worker failed");
  process.exit(1);
});
