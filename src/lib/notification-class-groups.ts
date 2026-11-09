/**
 * Legacy `notification_class_groups` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Notifications data type 43 stores a belongsToMany field named Class Group.
 * The pivot columns are `notification_id` and `class_group_id`.
 * The group name is `class_groups.name`.
 * `notifications.group_id` is a different column and is not this pivot.
 * This module only presents rows the caller already loaded for one notification.
 * A blank class group id stays blank. Rows are not merged.
 */

export type StoredNotificationClassGroup = {
  id: number;
  classGroupId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationClassGroupView = {
  id: number;
  classGroupId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  exportText: string;
};

function blank(value: string): string {
  return value.trim() || "blank";
}

export function presentNotificationClassGroup(row: StoredNotificationClassGroup): NotificationClassGroupView {
  const classGroupId = row.classGroupId.trim();
  const name = row.name.trim();
  const createdAt = row.createdAt.trim();
  const updatedAt = row.updatedAt.trim();
  const exportText = [
    `id ${row.id}`,
    `group ${blank(classGroupId)}`,
    `name ${blank(name)}`,
    `created ${blank(createdAt)}`,
    `updated ${blank(updatedAt)}`,
  ].join(" | ");
  return { id: row.id, classGroupId, name, createdAt, updatedAt, exportText };
}

export function notificationClassGroupExportLines(rows: StoredNotificationClassGroup[]): string[] {
  if (!rows.length) return ["Class Group: none stored"];
  return ["Class Group", ...rows.map((row) => presentNotificationClassGroup(row).exportText)];
}
