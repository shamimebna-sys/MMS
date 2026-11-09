/**
 * Legacy `trainings` rows. This is not `manpower_trainings`.
 * There is no Voyager data type and no browse/read/edit/add/delete permission key for this table.
 * Each row stores `user_id`. The parent is the user record the caller can already read.
 * The legacy dump has no foreign key on `user_id`. This module does not resolve another parent.
 * `country_id` is a stored varchar. It is not a foreign key and is not resolved to a country name.
 * `duration` is the stored integer, including 0. Null stays blank.
 * This module only presents rows the caller already loaded for one user.
 * Blank columns stay blank. Rows are not merged, and status is not rewritten.
 */

export type StoredTraining = {
  id: number;
  title: string;
  instituteName: string;
  topics: string;
  startDate: string;
  endDate: string;
  duration: string;
  durationType: string;
  countryId: string;
  descriptions: string;
  achievements: string;
  certificateFilePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  address: string;
};

export type TrainingView = StoredTraining & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentTraining(row: StoredTraining): TrainingView {
  const view: StoredTraining = {
    id: row.id,
    title: plain(row.title),
    instituteName: plain(row.instituteName),
    topics: plain(row.topics),
    startDate: plain(row.startDate),
    endDate: plain(row.endDate),
    duration: plain(row.duration),
    durationType: plain(row.durationType),
    countryId: plain(row.countryId),
    descriptions: plain(row.descriptions),
    achievements: plain(row.achievements),
    certificateFilePath: plain(row.certificateFilePath),
    status: plain(row.status),
    createdAt: plain(row.createdAt),
    updatedAt: plain(row.updatedAt),
    createdBy: plain(row.createdBy),
    updatedBy: plain(row.updatedBy),
    address: plain(row.address),
  };
  const exportText = [
    `id ${view.id}`,
    `title ${blank(view.title)}`,
    `institute ${blank(view.instituteName)}`,
    `topics ${blank(view.topics)}`,
    `start ${blank(view.startDate)}`,
    `end ${blank(view.endDate)}`,
    `duration ${blank(view.duration)}`,
    `duration type ${blank(view.durationType)}`,
    `country id ${blank(view.countryId)}`,
    `descriptions ${blank(view.descriptions)}`,
    `achievements ${blank(view.achievements)}`,
    `certificate ${blank(view.certificateFilePath)}`,
    `status ${blank(view.status)}`,
    `created ${blank(view.createdAt)}`,
    `updated ${blank(view.updatedAt)}`,
    `created by ${blank(view.createdBy)}`,
    `updated by ${blank(view.updatedBy)}`,
    `address ${blank(view.address)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function trainingExportLines(rows: StoredTraining[]): string[] {
  if (!rows.length) return ["Training: none stored"];
  return ["Training", ...rows.map((row) => presentTraining(row).exportText)];
}
