/**
 * Legacy `experiences` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `user_id`. The parent is the user record the caller can already read.
 * `country_id` is a stored varchar. It is not a foreign key and is not resolved to a country name.
 * This module only presents rows the caller already loaded for one user.
 * Blank columns stay blank. Rows are not merged, and status is not rewritten.
 */

export type StoredExperience = {
  id: number;
  companyName: string;
  companyAddress: string;
  countryId: string;
  designation: string;
  department: string;
  startDate: string;
  endDate: string;
  responsibilities: string;
  expertise: string;
  descriptions: string;
  achievements: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type ExperienceView = StoredExperience & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentExperience(row: StoredExperience): ExperienceView {
  const view: StoredExperience = {
    id: row.id,
    companyName: plain(row.companyName),
    companyAddress: plain(row.companyAddress),
    countryId: plain(row.countryId),
    designation: plain(row.designation),
    department: plain(row.department),
    startDate: plain(row.startDate),
    endDate: plain(row.endDate),
    responsibilities: plain(row.responsibilities),
    expertise: plain(row.expertise),
    descriptions: plain(row.descriptions),
    achievements: plain(row.achievements),
    status: plain(row.status),
    createdAt: plain(row.createdAt),
    updatedAt: plain(row.updatedAt),
    createdBy: plain(row.createdBy),
    updatedBy: plain(row.updatedBy),
  };
  const exportText = [
    `id ${view.id}`,
    `company ${blank(view.companyName)}`,
    `address ${blank(view.companyAddress)}`,
    `country id ${blank(view.countryId)}`,
    `designation ${blank(view.designation)}`,
    `department ${blank(view.department)}`,
    `start ${blank(view.startDate)}`,
    `end ${blank(view.endDate)}`,
    `responsibilities ${blank(view.responsibilities)}`,
    `expertise ${blank(view.expertise)}`,
    `descriptions ${blank(view.descriptions)}`,
    `achievements ${blank(view.achievements)}`,
    `status ${blank(view.status)}`,
    `created ${blank(view.createdAt)}`,
    `updated ${blank(view.updatedAt)}`,
    `created by ${blank(view.createdBy)}`,
    `updated by ${blank(view.updatedBy)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function experienceExportLines(rows: StoredExperience[]): string[] {
  if (!rows.length) return ["Experience: none stored"];
  return ["Experience", ...rows.map((row) => presentExperience(row).exportText)];
}
