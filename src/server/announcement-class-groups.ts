import { pool } from "@/lib/db";
import type { StoredAnnouncementClassGroup } from "@/lib/announcement-class-groups";

export type { AnnouncementClassGroupView, StoredAnnouncementClassGroup } from "@/lib/announcement-class-groups";
export { announcementClassGroupExportLines, presentAnnouncementClassGroup } from "@/lib/announcement-class-groups";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Class-group links for an announcement the caller has already been allowed to read. */
export async function loadAnnouncementClassGroups(announcementId: number): Promise<StoredAnnouncementClassGroup[]> {
  const result = await pool.query(
    `SELECT acg.id,
            COALESCE(acg.class_group_id::text, '') AS class_group_id,
            COALESCE(g.name, '') AS name,
            COALESCE(to_char(acg.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(acg.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM announcement_class_groups acg
     LEFT JOIN class_groups g ON g.id::text = acg.class_group_id::text
     WHERE acg.announcement_id = $1
     ORDER BY acg.id`,
    [announcementId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    classGroupId: text(row.class_group_id),
    name: text(row.name),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
