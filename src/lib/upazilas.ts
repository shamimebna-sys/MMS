/**
 * Legacy `upazilas` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `district_id`. The parent is the district record the caller can already read.
 * The legacy dump has no foreign key on `district_id`. This module does not resolve another parent.
 * `name`, `bn_name`, and `url` are stored text. They are not rewritten.
 * This module only presents rows the caller already loaded for one district.
 * Rows are not merged.
 */

export type StoredUpazila = {
  id: number;
  districtId: string;
  name: string;
  bnName: string;
  url: string;
};

export type UpazilaView = StoredUpazila & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentUpazila(row: StoredUpazila): UpazilaView {
  const view: StoredUpazila = {
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

export function upazilaExportLines(rows: StoredUpazila[]): string[] {
  if (!rows.length) return ["Upazilas: none stored"];
  return ["Upazilas", ...rows.map((row) => presentUpazila(row).exportText)];
}
