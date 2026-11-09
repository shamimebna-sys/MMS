import { pool } from "@/lib/db";
import type { StoredThana } from "@/lib/thanas";

export type { StoredThana, ThanaView } from "@/lib/thanas";
export { presentThana, thanaExportLines } from "@/lib/thanas";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Thana rows for a district the caller has already been allowed to read. */
export async function loadThanas(districtId: number): Promise<StoredThana[]> {
  const result = await pool.query(
    `SELECT t.id,
            COALESCE(t.district_id::text, '') AS district_id,
            COALESCE(t.name, '') AS name,
            COALESCE(t.bn_name, '') AS bn_name,
            COALESCE(t.url, '') AS url
     FROM thanas t
     WHERE t.district_id = $1
     ORDER BY t.id`,
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
