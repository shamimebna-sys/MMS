/**
 * Legacy `educations` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Each row stores `user_id`. The parent is the user record the caller can already read.
 * The legacy dump has no foreign key on `user_id`. This module does not resolve another parent.
 * This module only presents rows the caller already loaded for one user.
 * Blank columns stay blank. Rows are not merged, and status is not rewritten.
 */

export type StoredEducation = {
  id: number;
  examName: string;
  instituteName: string;
  subjectGroupMajor: string;
  educationLabel: string;
  startDate: string;
  endDate: string;
  durationYear: string;
  resultType: string;
  result: string;
  achievements: string;
  certificateFilePath: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  boardName: string;
  scale: string;
  passingYear: string;
};

export type EducationView = StoredEducation & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentEducation(row: StoredEducation): EducationView {
  const view: StoredEducation = {
    id: row.id,
    examName: plain(row.examName),
    instituteName: plain(row.instituteName),
    subjectGroupMajor: plain(row.subjectGroupMajor),
    educationLabel: plain(row.educationLabel),
    startDate: plain(row.startDate),
    endDate: plain(row.endDate),
    durationYear: plain(row.durationYear),
    resultType: plain(row.resultType),
    result: plain(row.result),
    achievements: plain(row.achievements),
    certificateFilePath: plain(row.certificateFilePath),
    status: plain(row.status),
    createdAt: plain(row.createdAt),
    updatedAt: plain(row.updatedAt),
    createdBy: plain(row.createdBy),
    updatedBy: plain(row.updatedBy),
    boardName: plain(row.boardName),
    scale: plain(row.scale),
    passingYear: plain(row.passingYear),
  };
  const exportText = [
    `id ${view.id}`,
    `exam ${blank(view.examName)}`,
    `institute ${blank(view.instituteName)}`,
    `subject ${blank(view.subjectGroupMajor)}`,
    `label ${blank(view.educationLabel)}`,
    `start ${blank(view.startDate)}`,
    `end ${blank(view.endDate)}`,
    `duration year ${blank(view.durationYear)}`,
    `result type ${blank(view.resultType)}`,
    `result ${blank(view.result)}`,
    `achievements ${blank(view.achievements)}`,
    `certificate ${blank(view.certificateFilePath)}`,
    `status ${blank(view.status)}`,
    `created ${blank(view.createdAt)}`,
    `updated ${blank(view.updatedAt)}`,
    `created by ${blank(view.createdBy)}`,
    `updated by ${blank(view.updatedBy)}`,
    `board ${blank(view.boardName)}`,
    `scale ${blank(view.scale)}`,
    `passing year ${blank(view.passingYear)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function educationExportLines(rows: StoredEducation[]): string[] {
  if (!rows.length) return ["Education: none stored"];
  return ["Education", ...rows.map((row) => presentEducation(row).exportText)];
}
