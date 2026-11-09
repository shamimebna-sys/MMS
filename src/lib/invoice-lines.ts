import { addDecimal } from "@/lib/money";
import { formatMoney } from "@/lib/utils";

/** One stored `invoice_lines` row. Amounts stay the saved text; nothing is recalculated. */
export type StoredInvoiceLine = {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
  subTotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
};

export type InvoiceLineView = {
  id: number;
  description: string;
  quantity: string;
  unitPrice: string;
  subTotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  exportText: string;
};

function decimalText(value: string): string {
  return /^-?\d+(\.\d+)?$/.test(value) ? value : "";
}

function moneyText(value: string): string {
  const raw = decimalText(value.trim());
  return raw ? formatMoney(raw) : "";
}

function rateText(value: string): string {
  const raw = decimalText(value.trim());
  if (!raw) return "";
  return addDecimal(raw, "0");
}

export function presentInvoiceLine(line: StoredInvoiceLine): InvoiceLineView {
  const description = line.description.trim() || "Untitled line";
  const quantity = line.quantity.trim();
  const unitPrice = moneyText(line.unitPrice);
  const subTotal = moneyText(line.subTotal);
  const vatRate = rateText(line.vatRate);
  const vatAmount = moneyText(line.vatAmount);
  const total = moneyText(line.total);
  const exportText = [
    description,
    `qty ${quantity || "blank"}`,
    `unit ${unitPrice || "blank"}`,
    `subtotal ${subTotal || "blank"}`,
    `vat rate ${vatRate || "blank"}`,
    `vat ${vatAmount || "blank"}`,
    `total ${total || "blank"}`,
  ].join(" | ");
  return { id: line.id, description, quantity, unitPrice, subTotal, vatRate, vatAmount, total, exportText };
}

/** Sum of stored line totals. Returns null when no stored total is present. */
export function sumStoredLineTotals(lines: StoredInvoiceLine[]): string | null {
  const amounts = lines.map((line) => decimalText(line.total.trim())).filter((value) => value !== "");
  if (!amounts.length) return null;
  return amounts.reduce((sum, value) => addDecimal(sum, value), "0");
}

export function invoiceLineExportLines(lines: StoredInvoiceLine[]): string[] {
  if (!lines.length) return ["Invoice lines: none stored"];
  const storedTotal = sumStoredLineTotals(lines);
  return [
    "Invoice lines",
    ...lines.map((line) => presentInvoiceLine(line).exportText),
    `Stored line total: ${storedTotal == null ? "blank" : formatMoney(storedTotal)}`,
  ];
}
