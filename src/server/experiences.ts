import { pool } from "@/lib/db";
import type { StoredExperience } from "@/lib/experiences";

export type { ExperienceView, StoredExperience } from "@/lib/experiences";
export { experienceExportLines, presentExperience } from "@/lib/experiences";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Experience rows for a user the caller has already been allowed to read. */
export async function loadExperiences(userId: number): Promise<StoredExperience[]> {
  const result = await pool.query(
    `SELECT e.id,
            COALESCE(e.company_name, '') AS company_name,
            COALESCE(e.company_address, '') AS company_address,
            COALESCE(e.country_id, '') AS country_id,
            COALESCE(e.designation, '') AS designation,
            COALESCE(e.department, '') AS department,
            COALESCE(to_char(e.start_date, 'YYYY-MM-DD'), '') AS start_date,
            COALESCE(to_char(e.end_date, 'YYYY-MM-DD'), '') AS end_date,
            COALESCE(e.responsibilities, '') AS responsibilities,
            COALESCE(e.expertise, '') AS expertise,
            COALESCE(e.descriptions, '') AS descriptions,
            COALESCE(e.achievements, '') AS achievements,
            COALESCE(e.status, '') AS status,
            COALESCE(to_char(e.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(e.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at,
            COALESCE(e.created_by::text, '') AS created_by,
            COALESCE(e.updated_by::text, '') AS updated_by
     FROM experiences e
     WHERE e.user_id = $1
     ORDER BY e.id`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    companyName: text(row.company_name),
    companyAddress: text(row.company_address),
    countryId: text(row.country_id),
    designation: text(row.designation),
    department: text(row.department),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    responsibilities: text(row.responsibilities),
    expertise: text(row.expertise),
    descriptions: text(row.descriptions),
    achievements: text(row.achievements),
    status: text(row.status),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    createdBy: text(row.created_by),
    updatedBy: text(row.updated_by),
  }));
}
