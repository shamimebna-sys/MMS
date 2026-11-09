import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const MIN_HEALTH_TOKEN_LENGTH = 32;

function publicHealthResponse(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

function diagnosticHealthResponse(ok: boolean, started: number): Response {
  return Response.json(
    { ok, db: ok, ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

/** Probe secret stays server-side. A missing, short, or wrong token is the public liveness response. */
function authorizedHealthProbe(request: Request): boolean {
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (!expected || expected.length < MIN_HEALTH_TOKEN_LENGTH) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return false;
  const providedDigest = createHash("sha256").update(match[1]).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function GET(request: Request) {
  let authorized = false;
  try {
    authorized = authorizedHealthProbe(request);
  } catch {
    return publicHealthResponse();
  }
  if (!authorized) return publicHealthResponse();

  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    return diagnosticHealthResponse(true, started);
  } catch {
    return diagnosticHealthResponse(false, started);
  }
}
