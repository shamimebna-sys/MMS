import { pool } from "@/lib/db";
import type { StoredUnion } from "@/lib/unions";

export type { StoredUnion, UnionView } from "@/lib/unions";
export { presentUnion, unionsForUpazila, upazilaUnionExportLines } from "@/lib/unions";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Union rows whose stored `upazilla_id` is one of the upazilas already loaded. */
export async function loadUnions(upazillaIds: number[]): Promise<StoredUnion[]> {
  const ids = upazillaIds.filter((id) => Number.isInteger(id));
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT n.id,
            COALESCE(n.upazilla_id::text, '') AS upazilla_id,
            COALESCE(n.name, '') AS name,
            COALESCE(n.bn_name, '') AS bn_name,
            COALESCE(n.url, '') AS url
     FROM unions n
     WHERE n.upazilla_id = ANY($1::int[])
     ORDER BY n.id`,
    [ids],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    upazillaId: text(row.upazilla_id),
    name: text(row.name),
    bnName: text(row.bn_name),
    url: text(row.url),
  }));
}
