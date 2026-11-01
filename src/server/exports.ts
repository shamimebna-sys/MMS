import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { sanitizeSpreadsheetCell } from "@/lib/excel";
import { displayValue } from "@/lib/utils";
import type { ResourceDef } from "@/server/resources";

type PdfFactory = {
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  setLocalAccessPolicy: (callback: (filePath: string) => boolean) => void;
  setUrlAccessPolicy: (callback: (url: string) => boolean) => void;
  createPdf: (definition: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
};

export function workbookBuffer(resource: ResourceDef, rows: Array<Record<string, unknown>>): Buffer {
  const header = resource.columns.map((column) => sanitizeSpreadsheetCell(column));
  const body = rows.map((row) => resource.columns.map((column) => sanitizeSpreadsheetCell(displayValue(row[column]))));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Export");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function fontPath(): string {
  const candidates = [
    process.env.PDF_FONT_PATH,
    path.join("assets", "fonts", "Roboto-Regular.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
  ].filter((value): value is string => Boolean(value));
  const found = candidates.map((value) => path.resolve(value)).find((value) => fs.existsSync(value));
  if (!found) throw new Error("PDF font file is missing.");
  return found;
}

export async function pdfBuffer(title: string, lines: string[]): Promise<Buffer> {
  const file = fontPath();
  const pdfMake = (await import("pdfmake")).default as unknown as PdfFactory;
  const resolved = path.resolve(file);
  pdfMake.setFonts({
    Roboto: { normal: resolved, bold: resolved, italics: resolved, bolditalics: resolved },
  });
  pdfMake.setLocalAccessPolicy((candidate) => path.resolve(candidate) === resolved);
  pdfMake.setUrlAccessPolicy(() => false);
  const document = pdfMake.createPdf({
    defaultStyle: { font: "Roboto", fontSize: 11 },
    content: [{ text: title, fontSize: 16, margin: [0, 0, 0, 12] }, ...lines.map((line) => ({ text: line, margin: [0, 2, 0, 2] }))],
    info: { title },
  });
  return document.getBuffer();
}
