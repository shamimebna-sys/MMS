import { pool } from "@/lib/db";
import type { StoredLicensePosition } from "@/lib/license-positions";

export type { LicensePositionView, StoredLicensePosition } from "@/lib/license-positions";
export { licensePositionExportLines, presentLicensePosition } from "@/lib/license-positions";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Position rows for a license the caller has already been allowed to read. */
export async function loadLicensePositions(licenseId: number): Promise<StoredLicensePosition[]> {
  const result = await pool.query(
    `SELECT lp.id,
            lp.position_id::text AS position_id,
            COALESCE(p.title, '') AS title,
            COALESCE(lp.quantity::text, '') AS quantity,
            COALESCE(to_char(lp.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(lp.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM license_positions lp
     LEFT JOIN positions p ON p.id::text = lp.position_id::text
     WHERE lp.license_id = $1
     ORDER BY lp.id`,
    [licenseId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    positionId: text(row.position_id),
    title: text(row.title),
    quantity: text(row.quantity),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
