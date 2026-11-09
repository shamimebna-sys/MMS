import type { SqlClient } from "@/lib/payment-ledger";
import {
  IdempotencyConflictError,
  sha256Hex,
  SUBMISSION_EXCLUDED_FIELDS,
  submissionFingerprint,
} from "@/lib/payment-idempotency";
import { quoteIdent } from "@/server/resources";
import { readStoredFileBytes } from "@/server/uploads";

export async function sha256OfPaymentFile(publicPath: string | null | undefined): Promise<string> {
  const path = (publicPath ?? "").trim();
  if (!path) return "";
  const id = path.startsWith("/api/files/") ? path.slice("/api/files/".length) : "";
  const bytes = id ? await readStoredFileBytes(id) : null;
  if (!bytes) throw new IdempotencyConflictError();
  return sha256Hex(bytes);
}

export async function readStoredFingerprint(
  db: SqlClient,
  paymentId: number,
  columns: string[],
  fileColumns: ReadonlySet<string>,
): Promise<string> {
  const selected = columns.filter((column) => !SUBMISSION_EXCLUDED_FIELDS.has(column));
  if (selected.length === 0) return submissionFingerprint({});
  const result = await db.query<Record<string, string | null>>(
    `SELECT ${selected.map((column) => `btrim(${quoteIdent(column)}::text) AS ${quoteIdent(column)}`).join(", ")}
     FROM payments WHERE id = $1`,
    [paymentId],
  );
  const row = result.rows[0] ?? {};
  const fields: Record<string, unknown> = {};
  for (const column of selected) {
    fields[column] = fileColumns.has(column) ? await sha256OfPaymentFile(row[column]) : row[column];
  }
  return submissionFingerprint(fields);
}
