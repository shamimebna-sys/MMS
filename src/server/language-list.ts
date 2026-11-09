import { pool } from "@/lib/db";
import type { StoredLanguage } from "@/lib/language-list";

export type { LanguageView, StoredLanguage } from "@/lib/language-list";
export { languageExportLines, presentLanguage } from "@/lib/language-list";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Language-list rows for a user the caller has already been allowed to read. */
export async function loadLanguageList(userId: number): Promise<StoredLanguage[]> {
  const result = await pool.query(
    `SELECT l.id,
            COALESCE(l.language_name, '') AS language_name,
            COALESCE(l.language_status, '') AS language_status,
            COALESCE(to_char(l.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(l.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM language_list l
     WHERE l.user_id = $1
     ORDER BY l.id`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    languageName: text(row.language_name),
    languageStatus: text(row.language_status),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
