import { pool } from "@/lib/db";
import type { StoredInvoiceLine } from "@/lib/invoice-lines";

export type { InvoiceLineView, StoredInvoiceLine } from "@/lib/invoice-lines";
export { invoiceLineExportLines, presentInvoiceLine, sumStoredLineTotals } from "@/lib/invoice-lines";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Lines for an invoice the caller has already been allowed to read. */
export async function loadInvoiceLines(invoiceId: number): Promise<StoredInvoiceLine[]> {
  const result = await pool.query(
    `SELECT l.id,
            COALESCE(NULLIF(btrim(l.description), ''), NULLIF(btrim(h.description), ''), '') AS description,
            l.quantity::text AS quantity,
            l.unit_price::text AS unit_price,
            l.sub_total_amount::text AS sub_total,
            l.vat_rate::text AS vat_rate,
            l.vat_amount::text AS vat_amount,
            l.total_amount::text AS total
     FROM invoice_lines l
     LEFT JOIN invoice_heads h ON h.id = l.invoice_head_id
     WHERE l.invoice_id = $1
     ORDER BY l.id`,
    [invoiceId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    description: text(row.description),
    quantity: text(row.quantity),
    unitPrice: text(row.unit_price),
    subTotal: text(row.sub_total),
    vatRate: text(row.vat_rate),
    vatAmount: text(row.vat_amount),
    total: text(row.total),
  }));
}
