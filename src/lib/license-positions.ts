/**
 * Legacy `license_positions` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key. Access is the parent license.
 * This module only presents rows the caller already loaded.
 * Position text is `positions.title`. Quantity stays the stored value, including blank.
 */

export type StoredLicensePosition = {
  id: number;
  positionId: string;
  title: string;
  quantity: string;
  createdAt: string;
  updatedAt: string;
};

export type LicensePositionView = {
  id: number;
  positionId: string;
  title: string;
  quantity: string;
  createdAt: string;
  updatedAt: string;
  exportText: string;
};

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentLicensePosition(row: StoredLicensePosition): LicensePositionView {
  const positionId = row.positionId.trim();
  const title = row.title.trim();
  const quantity = row.quantity.trim();
  const createdAt = row.createdAt.trim();
  const updatedAt = row.updatedAt.trim();
  const exportText = [
    `id ${row.id}`,
    `position ${blank(positionId)}`,
    `title ${blank(title)}`,
    `quantity ${blank(quantity)}`,
    `created ${blank(createdAt)}`,
    `updated ${blank(updatedAt)}`,
  ].join(" | ");
  return { id: row.id, positionId, title, quantity, createdAt, updatedAt, exportText };
}

export function licensePositionExportLines(rows: StoredLicensePosition[]): string[] {
  if (!rows.length) return ["Positions: none stored"];
  return ["Positions", ...rows.map((row) => presentLicensePosition(row).exportText)];
}
