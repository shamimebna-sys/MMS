import { pool } from "@/lib/db";
import type { StoredTraining } from "@/lib/trainings";

export type { StoredTraining, TrainingView } from "@/lib/trainings";
export { presentTraining, trainingExportLines } from "@/lib/trainings";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Training rows for a user the caller has already been allowed to read. Not manpower training. */
export async function loadTrainings(userId: number): Promise<StoredTraining[]> {
  const result = await pool.query(
    `SELECT t.id,
            COALESCE(t.title, '') AS title,
            COALESCE(t.institute_name, '') AS institute_name,
            COALESCE(t.topics, '') AS topics,
            COALESCE(to_char(t.start_date, 'YYYY-MM-DD'), '') AS start_date,
            COALESCE(to_char(t.end_date, 'YYYY-MM-DD'), '') AS end_date,
            COALESCE(t.duration::text, '') AS duration,
            COALESCE(t.duration_type, '') AS duration_type,
            COALESCE(t.country_id, '') AS country_id,
            COALESCE(t.descriptions, '') AS descriptions,
            COALESCE(t.achievements, '') AS achievements,
            COALESCE(t.certificate_file_path, '') AS certificate_file_path,
            COALESCE(t.status, '') AS status,
            COALESCE(to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(t.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at,
            COALESCE(t.created_by::text, '') AS created_by,
            COALESCE(t.updated_by::text, '') AS updated_by,
            COALESCE(t.address, '') AS address
     FROM trainings t
     WHERE t.user_id = $1
     ORDER BY t.id`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    title: text(row.title),
    instituteName: text(row.institute_name),
    topics: text(row.topics),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    duration: text(row.duration),
    durationType: text(row.duration_type),
    countryId: text(row.country_id),
    descriptions: text(row.descriptions),
    achievements: text(row.achievements),
    certificateFilePath: text(row.certificate_file_path),
    status: text(row.status),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    createdBy: text(row.created_by),
    updatedBy: text(row.updated_by),
    address: text(row.address),
  }));
}
