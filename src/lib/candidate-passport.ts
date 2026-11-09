import type { SqlClient } from "@/lib/payment-ledger";

/**
 * The current passport is the trimmed text in `candidates.passport_no`.
 * Equality follows this database: case-sensitive, and internal spaces stay.
 * A candidate may later hold a different number. The previous number, issue
 * date, expiry date, and file are inserted into `candidate_passports` first.
 * That history belongs to the same candidate and does not block the new number.
 * Another candidate cannot take a current or historical number. Existing
 * duplicate candidate rows are left in place, so there is no unique index.
 * Concurrent saves of one new number take a transaction lock instead.
 */
export const DUPLICATE_PASSPORT_MESSAGE = "This passport number is already recorded on another candidate.";

export type PassportTables = {
  candidates?: string;
  history?: string;
};

export function normalizePassportNo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function assignedPassportKey(assignments: ReadonlyArray<{ column: string; value: unknown }>): string | null {
  const field = assignments.find((item) => item.column === "passport_no");
  if (!field) return null;
  return normalizePassportNo(field.value);
}

/** Null when the save does not include the passport field. */
export function assignedPassportField(
  assignments: ReadonlyArray<{ column: string; value: unknown }>,
): { passport: string | null } | null {
  const field = assignments.find((item) => item.column === "passport_no");
  if (!field) return null;
  return { passport: normalizePassportNo(field.value) };
}

function tableName(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid passport table.");
  return name;
}

export function passportGuardSql(candidates = "candidates", history = "candidate_passports"): {
  lock: string;
  current: string;
  conflict: string;
  historyConflict: string;
  archive: string;
} {
  const currentTable = tableName(candidates);
  const historyTable = tableName(history);
  return {
    lock: `SELECT pg_advisory_xact_lock(hashtext(lower(btrim($1::text))))::text AS locked`,
    current: `SELECT passport_no, passport_issue_date, passport_expire_date, passport_file_path
FROM ${currentTable}
WHERE id = $1
FOR UPDATE`,
    conflict: `SELECT id FROM ${currentTable}
WHERE passport_no IS NOT NULL
  AND btrim(passport_no) = btrim($1::text)
  AND id IS DISTINCT FROM $2::int
LIMIT 1`,
    historyConflict: `SELECT id FROM ${historyTable}
WHERE btrim(passport_no) = btrim($1::text)
  AND candidate_id IS DISTINCT FROM $2::int
LIMIT 1`,
    archive: `INSERT INTO ${historyTable}
  (candidate_id, passport_no, passport_issue_date, passport_expire_date, passport_file_path, replaced_at)
VALUES ($1, $2, $3, $4, $5, NOW())`,
  };
}

/**
 * When the current number changes, archive the stored passport, then reject the
 * new number if another candidate already holds it as current or as history.
 * The same candidate's own history is not a conflict. An unchanged number is
 * kept, including when another candidate row already shares it.
 */
export async function retainPassportHistory(
  db: SqlClient,
  nextPassport: string | null,
  candidateId: number | null,
  tables?: PassportTables,
): Promise<void> {
  const sql = passportGuardSql(tables?.candidates, tables?.history);
  let previous: string | null = null;
  let previousRow: Record<string, unknown> | undefined;
  if (candidateId != null) {
    const current = await db.query<Record<string, unknown>>(sql.current, [candidateId]);
    previousRow = current.rows[0];
    previous = normalizePassportNo(previousRow?.passport_no);
    if (previous === nextPassport) return;
  }
  if (nextPassport) {
    await db.query(sql.lock, [nextPassport]);
    const conflict = await db.query<{ id: number }>(sql.conflict, [nextPassport, candidateId]);
    if (conflict.rows.length > 0) throw new Error(DUPLICATE_PASSPORT_MESSAGE);
    const historical = await db.query<{ id: number }>(sql.historyConflict, [nextPassport, candidateId]);
    if (historical.rows.length > 0) throw new Error(DUPLICATE_PASSPORT_MESSAGE);
  }
  if (candidateId != null && previous && previousRow) {
    await db.query(sql.archive, [
      candidateId,
      previousRow.passport_no,
      previousRow.passport_issue_date ?? null,
      previousRow.passport_expire_date ?? null,
      previousRow.passport_file_path ?? null,
    ]);
  }
}

export async function assertPassportAvailable(
  db: SqlClient,
  passport: string,
  exceptId: number | null,
  table = "candidates",
  history = "candidate_passports",
): Promise<void> {
  await retainPassportHistory(db, passport, exceptId, { candidates: table, history });
}
