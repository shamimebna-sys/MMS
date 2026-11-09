/**
 * Legacy `unions` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `upazilla_id`. The parent is an upazila row the caller already loaded.
 * The legacy dump has no foreign key on `upazilla_id`. This module matches that stored id only.
 * It does not match a union to an upazila by name.
 * `name`, `bn_name`, and `url` are stored text. They are not rewritten.
 * Rows are not merged.
 */

import { presentUpazila, type StoredUpazila } from "@/lib/upazilas";

export type StoredUnion = {
  id: number;
  upazillaId: string;
  name: string;
  bnName: string;
  url: string;
};

export type UnionView = StoredUnion & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentUnion(row: StoredUnion): UnionView {
  const view: StoredUnion = {
    id: row.id,
    upazillaId: plain(row.upazillaId),
    name: plain(row.name),
    bnName: plain(row.bnName),
    url: plain(row.url),
  };
  const exportText = [
    `id ${view.id}`,
    `upazila ${blank(view.upazillaId)}`,
    `name ${blank(view.name)}`,
    `bn ${blank(view.bnName)}`,
    `url ${blank(view.url)}`,
  ].join(" | ");
  return { ...view, exportText };
}

/** Unions whose stored `upazilla_id` is this upazila id, in legacy id order. */
export function unionsForUpazila(rows: StoredUnion[], upazilaId: number): UnionView[] {
  const key = String(upazilaId);
  return rows
    .filter((row) => plain(row.upazillaId) === key)
    .slice()
    .sort((left, right) => left.id - right.id)
    .map(presentUnion);
}

/**
 * District PDF lines. Each upazila is followed by the unions stored on its id.
 * An empty upazila list stays the existing upazila empty line and does not add unions.
 */
export function upazilaUnionExportLines(upazilas: StoredUpazila[], unions: StoredUnion[]): string[] {
  if (!upazilas.length) return ["Upazilas: none stored"];
  const lines = ["Upazilas"];
  for (const upazila of upazilas) {
    lines.push(presentUpazila(upazila).exportText);
    const children = unionsForUpazila(unions, upazila.id);
    if (!children.length) {
      lines.push("Unions: none stored");
      continue;
    }
    lines.push("Unions");
    for (const child of children) lines.push(child.exportText);
  }
  return lines;
}
