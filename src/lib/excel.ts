/** Prevent spreadsheet formula injection in exported cells. */
export function sanitizeSpreadsheetCell(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
}

export function sanitizeSpreadsheetRow(row: unknown[]): Array<string | number | boolean | null> {
  return row.map((cell) => sanitizeSpreadsheetCell(cell));
}
