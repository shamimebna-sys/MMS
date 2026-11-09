/** Legacy `agencies` and `companies` rows are immutable historical snapshots. */
const LEGACY_SNAPSHOT_TABLES = new Set(["agencies", "companies"]);

export function isLegacySnapshotTable(table: string): boolean {
  return LEGACY_SNAPSHOT_TABLES.has(table);
}

/** Normal application writes must not rewrite, replace, or remove these rows. */
export function assertLegacySnapshotPreserved(table: string): void {
  if (isLegacySnapshotTable(table)) {
    throw new Error("Historical agency and company snapshots cannot be changed or removed.");
  }
}
