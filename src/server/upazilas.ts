import { pool } from "@/lib/db";
import type { StoredUpazila } from "@/lib/upazilas";

export type { StoredUpazila, UpazilaView } from "@/lib/upazilas";
export { presentUpazila, upazilaExportLines } from "@/lib/upazilas";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Upazila rows for a district the caller has already been allowed to read. */
export async function loadUpazilas(districtId: number): Promise<StoredUpazila[]> {
  const result = await pool.query(
    `SELECT u.id,
            COALESCE(u.district_id::text, '') AS district_id,
            COALESCE(u.name, '') AS name,
            COALESCE(u.bn_name, '') AS bn_name,
            COALESCE(u.url, '') AS url
     FROM upazilas u
     WHERE u.district_id = $1
     ORDER BY u.id`,
    [districtId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    districtId: text(row.district_id),
    name: text(row.name),
    bnName: text(row.bn_name),
    url: text(row.url),
  }));
}
