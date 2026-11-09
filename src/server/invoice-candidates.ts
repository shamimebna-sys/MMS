import { pool } from "@/lib/db";
import type { StoredInvoiceCandidate } from "@/lib/invoice-candidates";

export type { InvoiceCandidateView, StoredInvoiceCandidate } from "@/lib/invoice-candidates";
export { candidateDetailsLabel, invoiceCandidateExportLines, presentInvoiceCandidate } from "@/lib/invoice-candidates";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Pivot rows for an invoice the caller has already been allowed to read. */
export async function loadInvoiceCandidates(invoiceId: number): Promise<StoredInvoiceCandidate[]> {
  const result = await pool.query(
    `SELECT ic.id,
            ic.candidate_id::text AS candidate_id,
            COALESCE(c.code, '') AS code,
            COALESCE(c.name, '') AS name,
            COALESCE(to_char(ic.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(ic.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM invoice_candidates ic
     LEFT JOIN candidates c ON c.id::text = ic.candidate_id::text
     WHERE ic.invoice_id = $1
     ORDER BY ic.id`,
    [invoiceId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    candidateId: text(row.candidate_id),
    code: text(row.code),
    name: text(row.name),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
