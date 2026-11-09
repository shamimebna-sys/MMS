/**
 * Legacy `skills` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `user_id`. The parent is the user record the caller can already read.
 * The legacy dump has no foreign key on `user_id`. This module does not resolve another parent.
 * `result_score` and `exam_score` are stored numbers. Null stays blank and is not rewritten to 0.
 * This module only presents rows the caller already loaded for one user.
 * Blank columns stay blank. Rows are not merged, and status is not rewritten.
 */

export type StoredSkill = {
  id: number;
  title: string;
  instituteName: string;
  details: string;
  resultScore: string;
  certificateFilePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  examScore: string;
};

export type SkillView = StoredSkill & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentSkill(row: StoredSkill): SkillView {
  const view: StoredSkill = {
    id: row.id,
    title: plain(row.title),
    instituteName: plain(row.instituteName),
    details: plain(row.details),
    resultScore: plain(row.resultScore),
    certificateFilePath: plain(row.certificateFilePath),
    status: plain(row.status),
    createdAt: plain(row.createdAt),
    updatedAt: plain(row.updatedAt),
    createdBy: plain(row.createdBy),
    updatedBy: plain(row.updatedBy),
    examScore: plain(row.examScore),
  };
  const exportText = [
    `id ${view.id}`,
    `title ${blank(view.title)}`,
    `institute ${blank(view.instituteName)}`,
    `details ${blank(view.details)}`,
    `result score ${blank(view.resultScore)}`,
    `certificate ${blank(view.certificateFilePath)}`,
    `status ${blank(view.status)}`,
    `created ${blank(view.createdAt)}`,
    `updated ${blank(view.updatedAt)}`,
    `created by ${blank(view.createdBy)}`,
    `updated by ${blank(view.updatedBy)}`,
    `exam score ${blank(view.examScore)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function skillExportLines(rows: StoredSkill[]): string[] {
  if (!rows.length) return ["Skills: none stored"];
  return ["Skills", ...rows.map((row) => presentSkill(row).exportText)];
}
