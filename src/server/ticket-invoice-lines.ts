import { pool } from "@/lib/db";
import type { StoredTicketInvoiceLine } from "@/lib/ticket-invoice-lines";

export type { StoredTicketInvoiceLine, TicketInvoiceLineView } from "@/lib/ticket-invoice-lines";
export { presentTicketInvoiceLine, sumStoredTicketLineTotals, ticketInvoiceLineExportLines } from "@/lib/ticket-invoice-lines";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Lines for a ticket invoice the caller has already been allowed to read. */
export async function loadTicketInvoiceLines(ticketInvoiceId: number): Promise<StoredTicketInvoiceLine[]> {
  const result = await pool.query(
    `SELECT id,
            candidate_id::text AS candidate_id,
            COALESCE(name, '') AS name,
            COALESCE(passport_no, '') AS passport_no,
            COALESCE(remarks, '') AS remarks,
            quantity::text AS quantity,
            unit_price::text AS unit_price,
            total_amount::text AS total,
            COALESCE(is_candidate, '') AS is_candidate,
            COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM ticket_invoice_lines
     WHERE ticket_invoice_id = $1
     ORDER BY id`,
    [ticketInvoiceId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    candidateId: text(row.candidate_id),
    name: text(row.name),
    passportNo: text(row.passport_no),
    remarks: text(row.remarks),
    quantity: text(row.quantity),
    unitPrice: text(row.unit_price),
    total: text(row.total),
    isCandidate: text(row.is_candidate),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
