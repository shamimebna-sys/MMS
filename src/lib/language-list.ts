/**
 * Legacy `language_list` rows.
 * There is no Voyager data type and no browse/read/edit/add/delete permission key for this table.
 * Each stored row has `user_id`. The parent is the user record the caller can already read.
 * The legacy dump has a primary key on `id` and no foreign key on `user_id`.
 * This module does not resolve another parent and does not invent a permission.
 * `language_name` and `language_status` are stored text. They are not rewritten.
 * `created_at` and `updated_at` stay blank when null.
 * This module only presents rows the caller already loaded for one user.
 * Blank columns stay blank. Rows are not merged.
 */

export type StoredLanguage = {
  id: number;
  languageName: string;
  languageStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type LanguageView = StoredLanguage & {
  exportText: string;
};

function plain(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ").trim();
}

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentLanguage(row: StoredLanguage): LanguageView {
  const view: StoredLanguage = {
    id: row.id,
    languageName: plain(row.languageName),
    languageStatus: plain(row.languageStatus),
    createdAt: plain(row.createdAt),
    updatedAt: plain(row.updatedAt),
  };
  const exportText = [
    `id ${view.id}`,
    `language ${blank(view.languageName)}`,
    `status ${blank(view.languageStatus)}`,
    `created ${blank(view.createdAt)}`,
    `updated ${blank(view.updatedAt)}`,
  ].join(" | ");
  return { ...view, exportText };
}

export function languageExportLines(rows: StoredLanguage[]): string[] {
  if (!rows.length) return ["Language list: none stored"];
  return ["Language list", ...rows.map((row) => presentLanguage(row).exportText)];
}
