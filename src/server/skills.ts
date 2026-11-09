import { pool } from "@/lib/db";
import type { StoredSkill } from "@/lib/skills";

export type { SkillView, StoredSkill } from "@/lib/skills";
export { presentSkill, skillExportLines } from "@/lib/skills";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Skill rows for a user the caller has already been allowed to read. */
export async function loadSkills(userId: number): Promise<StoredSkill[]> {
  const result = await pool.query(
    `SELECT s.id,
            COALESCE(s.title, '') AS title,
            COALESCE(s.institute_name, '') AS institute_name,
            COALESCE(s.details, '') AS details,
            COALESCE(s.result_score::text, '') AS result_score,
            COALESCE(s.certificate_file_path, '') AS certificate_file_path,
            COALESCE(s.status, '') AS status,
            COALESCE(to_char(s.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(s.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at,
            COALESCE(s.created_by::text, '') AS created_by,
            COALESCE(s.updated_by::text, '') AS updated_by,
            COALESCE(s.exam_score::text, '') AS exam_score
     FROM skills s
     WHERE s.user_id = $1
     ORDER BY s.id`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    title: text(row.title),
    instituteName: text(row.institute_name),
    details: text(row.details),
    resultScore: text(row.result_score),
    certificateFilePath: text(row.certificate_file_path),
    status: text(row.status),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    createdBy: text(row.created_by),
    updatedBy: text(row.updated_by),
    examScore: text(row.exam_score),
  }));
}
