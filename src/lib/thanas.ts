/**
 * Legacy `thanas` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `district_id`. The parent is the district record the caller can already read.
 * The legacy dump has no foreign key on `district_id`. This module does not resolve another parent.
 * `name`, `bn_name`, and `url` are stored text. They are not rewritten.
 * This module only presents rows the caller already loaded for one district.
 * Rows are not merged.
 */

export type StoredThana = {
  id: number;
  districtId: string;
  name: string;
  bnName: string;
  url: string;
};

export type ThanaView = StoredThana & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentThana(row: StoredThana): ThanaView {
  const view: StoredThana = {
    id: row.id,
    districtId: plain(row.districtId),
    name: plain(row.name),
    bnName: plain(row.bnName),
    url: plain(row.url),
  };
  const exportText = [
    `id ${view.id}`,
    `district ${blank(view.districtId)}`,
    `name ${blank(view.name)}`,
    `bn ${blank(view.bnName)}`,
    `url ${blank(view.url)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function thanaExportLines(rows: StoredThana[]): string[] {
  if (!rows.length) return ["Thanas: none stored"];
  return ["Thanas", ...rows.map((row) => presentThana(row).exportText)];
}
