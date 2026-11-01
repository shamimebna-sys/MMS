import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: true, ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, db: false, ms: Date.now() - started }, { status: 503 });
  }
}
