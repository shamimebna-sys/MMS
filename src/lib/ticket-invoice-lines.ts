import { addDecimal } from "@/lib/money";
import { formatMoney } from "@/lib/utils";

/** One stored `ticket_invoice_lines` row. Amounts stay the saved text; nothing is recalculated. */
export type StoredTicketInvoiceLine = {
  id: number;
  candidateId: string;
  name: string;
  passportNo: string;
  remarks: string;
  quantity: string;
  unitPrice: string;
  total: string;
  isCandidate: string;
  createdAt: string;
  updatedAt: string;
};

export type TicketInvoiceLineView = {
  id: number;
  candidateId: string;
  name: string;
  passportNo: string;
  remarks: string;
  quantity: string;
  unitPrice: string;
  total: string;
  isCandidate: string;
  createdAt: string;
  updatedAt: string;
  exportText: string;
};

function decimalText(value: string): string {
  return /^-?\d+(\.\d+)?$/.test(value) ? value : "";
}

function moneyText(value: string): string {
  const raw = decimalText(value.trim());
  return raw ? formatMoney(raw) : "";
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentTicketInvoiceLine(line: StoredTicketInvoiceLine): TicketInvoiceLineView {
  const name = line.name.trim();
  const passportNo = line.passportNo.trim();
  const remarks = line.remarks.trim();
  const quantity = line.quantity.trim();
  const unitPrice = moneyText(line.unitPrice);
  const total = moneyText(line.total);
  const candidateId = line.candidateId.trim();
  const isCandidate = line.isCandidate.trim();
  const createdAt = line.createdAt.trim();
  const updatedAt = line.updatedAt.trim();
  const exportText = [
    `name ${blank(name)}`,
    `passport ${blank(passportNo)}`,
    `candidate ${blank(candidateId)}`,
    `is_candidate ${blank(isCandidate)}`,
    `remarks ${blank(remarks)}`,
    `qty ${quantity || "blank"}`,
    `unit ${unitPrice || "blank"}`,
    `total ${total || "blank"}`,
    `created ${blank(createdAt)}`,
    `updated ${blank(updatedAt)}`,
  ].join(" | ");
  return {
    id: line.id,
    candidateId,
    name,
    passportNo,
    remarks,
    quantity,
    unitPrice,
    total,
    isCandidate,
    createdAt,
    updatedAt,
    exportText,
  };
}

/** Sum of stored line totals. Returns null when no stored total is present. */
export function sumStoredTicketLineTotals(lines: StoredTicketInvoiceLine[]): string | null {
  const amounts = lines.map((line) => decimalText(line.total.trim())).filter((value) => value !== "");
  if (!amounts.length) return null;
  return amounts.reduce((sum, value) => addDecimal(sum, value), "0");
}

export function ticketInvoiceLineExportLines(lines: StoredTicketInvoiceLine[]): string[] {
  if (!lines.length) return ["Ticket invoice lines: none stored"];
  const storedTotal = sumStoredTicketLineTotals(lines);
  return [
    "Ticket invoice lines",
    ...lines.map((line) => presentTicketInvoiceLine(line).exportText),
    `Stored line total: ${storedTotal == null ? "blank" : formatMoney(storedTotal)}`,
  ];
}
