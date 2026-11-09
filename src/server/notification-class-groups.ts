import { pool } from "@/lib/db";
import type { StoredNotificationClassGroup } from "@/lib/notification-class-groups";

export type { NotificationClassGroupView, StoredNotificationClassGroup } from "@/lib/notification-class-groups";
export { notificationClassGroupExportLines, presentNotificationClassGroup } from "@/lib/notification-class-groups";

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Class-group links for a notification the caller has already been allowed to read. */
export async function loadNotificationClassGroups(notificationId: number): Promise<StoredNotificationClassGroup[]> {
  const result = await pool.query(
    `SELECT ncg.id,
            COALESCE(ncg.class_group_id::text, '') AS class_group_id,
            COALESCE(g.name, '') AS name,
            COALESCE(to_char(ncg.created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS created_at,
            COALESCE(to_char(ncg.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS updated_at
     FROM notification_class_groups ncg
     LEFT JOIN class_groups g ON g.id::text = ncg.class_group_id::text
     WHERE ncg.notification_id = $1
     ORDER BY ncg.id`,
    [notificationId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    classGroupId: text(row.class_group_id),
    name: text(row.name),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));
}
