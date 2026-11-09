/**
 * Legacy `invoice_candidates` is the invoices belongsToMany pivot.
 * Data type 53, field `invoice_belongstomany_candidate_relationship`.
 * Display name Candidates. Flags: required 1, browse 0, read 1, edit 1, add 1, delete 1.
 * There is no `invoice_candidates` data type and no browse/read/edit/add/delete permission key.
 * Access is the parent invoice permission. This module only presents rows the caller already loaded.
 * The label is Voyager `candidate_details_info`: `(code) name`.
 */

export type StoredInvoiceCandidate = {
  id: number;
  candidateId: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceCandidateView = {
  id: number;
  candidateId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  exportText: string;
};

function blank(value: string): string {
  return value.trim() || "blank";
}

/** Same label as the invoice relationship: `(code) name`, omitting an empty code or name. */
export function candidateDetailsLabel(code: string, name: string): string {
  const trimmedCode = code.trim();
  const trimmedName = name.trim();
  return [trimmedCode ? `(${trimmedCode})` : "", trimmedName].filter((part) => part !== "").join(" ");
}

export function presentInvoiceCandidate(row: StoredInvoiceCandidate): InvoiceCandidateView {
  const candidateId = row.candidateId.trim();
  const label = candidateDetailsLabel(row.code, row.name);
  const createdAt = row.createdAt.trim();
  const updatedAt = row.updatedAt.trim();
  const exportText = [
    `id ${row.id}`,
    `candidate ${blank(candidateId)}`,
    `label ${blank(label)}`,
    `created ${blank(createdAt)}`,
    `updated ${blank(updatedAt)}`,
  ].join(" | ");
  return { id: row.id, candidateId, label, createdAt, updatedAt, exportText };
}

export function invoiceCandidateExportLines(rows: StoredInvoiceCandidate[]): string[] {
  if (!rows.length) return ["Candidates: none stored"];
  return ["Candidates", ...rows.map((row) => presentInvoiceCandidate(row).exportText)];
}
