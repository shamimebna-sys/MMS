import { pool } from "@/lib/db";
import type { StoredEducation } from "@/lib/educations";

export type { EducationView, StoredEducation } from "@/lib/educations";
export { educationExportLines, presentEducation } from "@/lib/educations";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Education rows for a user the caller has already been allowed to read. */
export async function loadEducations(userId: number): Promise<StoredEducation[]> {
  const result = await pool.query(
    `SELECT e.id,
            COALESCE(e.exam_name, '') AS exam_name,
            COALESCE(e.institute_name, '') AS institute_name,
            COALESCE(e.subject_group_major, '') AS subject_group_major,
            COALESCE(e.education_label, '') AS education_label,
            COALESCE(to_char(e.start_date, 'YYYY-MM-DD'), '') AS start_date,
            COALESCE(to_char(e.end_date, 'YYYY-MM-DD'), '') AS end_date,
            COALESCE(e.duration_year::text, '') AS duration_year,
            COALESCE(e.result_type, '') AS result_type,
            COALESCE(e.result, '') AS result,
            COALESCE(e.achievements, '') AS achievements,
            COALESCE(e.certificate_file_path, '') AS certificate_file_path,
            COALESCE(e.status, '') AS status,
            COALESCE(to_char(e.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(e.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at,
            COALESCE(e.created_by::text, '') AS created_by,
            COALESCE(e.updated_by::text, '') AS updated_by,
            COALESCE(e.board_name, '') AS board_name,
            COALESCE(e.scale, '') AS scale,
            COALESCE(e.passing_year, '') AS passing_year
     FROM educations e
     WHERE e.user_id = $1
     ORDER BY e.id`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    examName: text(row.exam_name),
    instituteName: text(row.institute_name),
    subjectGroupMajor: text(row.subject_group_major),
    educationLabel: text(row.education_label),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    durationYear: text(row.duration_year),
    resultType: text(row.result_type),
    result: text(row.result),
    achievements: text(row.achievements),
    certificateFilePath: text(row.certificate_file_path),
    status: text(row.status),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    createdBy: text(row.created_by),
    updatedBy: text(row.updated_by),
    boardName: text(row.board_name),
    scale: text(row.scale),
    passingYear: text(row.passing_year),
  }));
}
