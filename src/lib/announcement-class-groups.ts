/**
 * Legacy `announcement_class_groups` rows. There is no Voyager data type and no
 * browse/read/edit/add/delete permission key for this table.
 * Announcements data type 23 stores a belongsToMany field named Group.
 * The pivot columns are `announcement_id` and `class_group_id`.
 * The group name is `class_groups.name`.
 * This module only presents rows the caller already loaded.
 * A blank class group id stays blank. Rows are not merged.
 */

export type StoredAnnouncementClassGroup = {
  id: number;
  classGroupId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementClassGroupView = {
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

export function presentAnnouncementClassGroup(row: StoredAnnouncementClassGroup): AnnouncementClassGroupView {
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

export function announcementClassGroupExportLines(rows: StoredAnnouncementClassGroup[]): string[] {
  if (!rows.length) return ["Groups: none stored"];
  return ["Groups", ...rows.map((row) => presentAnnouncementClassGroup(row).exportText)];
}
