import type { AccessUser } from "@/lib/auth/permissions";
import { isSafeMediaPath, PUBLIC_MEDIA_PLACEHOLDER, publicCandidateFilter, storedFileBypass } from "@/lib/auth/public-candidate";
import { quoteIdent, visibilitySql, type ScopedResource } from "@/lib/auth/row-scope";
import { walletLedgerScope, walletPaymentWhere } from "@/lib/auth/wallet-scope";
import { pool } from "@/lib/db";
import { resolveResource } from "@/server/resources";

type FileColumn = { table: string; column: string };

let catalogPromise: Promise<FileColumn[]> | null = null;
let candidateTablesPromise: Promise<Set<string>> | null = null;

function shiftPlaceholders(sql: string, offset: number): string {
  return sql.replace(/\$(\d+)/g, (_match, number: string) => `$${offset + Number(number)}`);
}

function pathMatch(qualifiedColumn: string): string {
  const normalized = `replace(btrim(coalesce(${qualifiedColumn}, '')), chr(92), '/')`;
  const relative = `regexp_replace(regexp_replace(${normalized}, '^https?://[^/]+/storage/?', ''), '^/+', '')`;
  return `(${relative} = $1 OR strpos(${normalized}, '"' || $1 || '"') > 0)`;
}

async function fileColumns(): Promise<FileColumn[]> {
  if (catalogPromise) return catalogPromise;
  const loading = pool
    .query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('text', 'character varying')
         AND (column_name LIKE '%\\_file\\_path' ESCAPE '\\' OR column_name IN ('image', 'avatar'))`,
    )
    .then((result) =>
      (result.rows as Array<{ table_name: string; column_name: string }>).flatMap((row) => {
        try {
          quoteIdent(row.table_name);
          quoteIdent(row.column_name);
          return [{ table: row.table_name, column: row.column_name }];
        } catch {
          return [];
        }
      }),
    )
    .catch((error: unknown) => {
      catalogPromise = null;
      throw error;
    });
  catalogPromise = loading;
  return loading;
}

async function candidateTables(): Promise<Set<string>> {
  if (candidateTablesPromise) return candidateTablesPromise;
  const loading = pool
    .query(`SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'candidate_id'`)
    .then((result) => new Set((result.rows as Array<{ table_name: string }>).map((row) => row.table_name)))
    .catch((error: unknown) => {
      candidateTablesPromise = null;
      throw error;
    });
  candidateTablesPromise = loading;
  return loading;
}

function resourceFor(table: string, childTables: Set<string>): ScopedResource | null {
  const existing = resolveResource(table);
  if (existing) return existing;
  if (childTables.has(table)) return { table, scope: { mode: "candidate-child", column: "candidate_id" } };
  return null;
}

export async function columnVisible(user: AccessUser, needle: string): Promise<boolean> {
  if (!needle || needle.length > 300) return false;
  const [columns, childTables] = await Promise.all([fileColumns(), candidateTables()]);
  const grouped = new Map<string, string[]>();
  for (const column of columns) {
    const list = grouped.get(column.table) ?? [];
    list.push(column.column);
    grouped.set(column.table, list);
  }
  const params: unknown[] = [needle];
  const parts: string[] = [];
  for (const [table, names] of grouped) {
    if (table === "payments") {
      const matches = names.map((name) => pathMatch(`p.${quoteIdent(name)}`)).join(" OR ");
      const local: unknown[] = [];
      const where = walletPaymentWhere(walletLedgerScope(user), local);
      const shifted = shiftPlaceholders(where, params.length);
      params.push(...local);
      parts.push(`EXISTS (SELECT 1 FROM payments p WHERE (${matches}) AND ${shifted})`);
      continue;
    }
    const matches = names.map((name) => pathMatch(`t.${quoteIdent(name)}`)).join(" OR ");
    const resource = resourceFor(table, childTables);
    if (!resource) continue;
    const local: unknown[] = [];
    const visibility = visibilitySql(resource, user, local);
    const shifted = shiftPlaceholders(visibility, params.length);
    params.push(...local);
    const quoted = quoteIdent(table);
    parts.push(`EXISTS (SELECT 1 FROM ${quoted} t WHERE (${matches}) AND t.id IN (SELECT id FROM ${quoted} WHERE ${shifted}))`);
  }
  if (parts.length === 0) return false;
  const found = await pool.query(`SELECT 1 WHERE ${parts.join(" OR ")} LIMIT 1`, params);
  return (found.rowCount ?? 0) > 0;
}

export async function isPublishedMedia(path: string): Promise<boolean> {
  const portrait = (column: string) => pathMatch(`c.${quoteIdent(column)}`);
  const found = await pool.query(
    `SELECT 1 WHERE
       EXISTS (SELECT 1 FROM posts p WHERE p.status = 'PUBLISHED' AND ${pathMatch(`p.${quoteIdent("image")}`)})
       OR EXISTS (SELECT 1 FROM pages g WHERE g.status = 'ACTIVE' AND ${pathMatch(`g.${quoteIdent("image")}`)})
       OR EXISTS (
         SELECT 1 FROM candidates c
         WHERE ${publicCandidateFilter("c")}
           AND (${portrait("half_photo_file_path")} OR ${portrait("full_photo_file_path")})
       )
     LIMIT 1`,
    [path],
  );
  return (found.rowCount ?? 0) > 0;
}

export async function canReadMediaPath(user: AccessUser | null, path: string): Promise<boolean> {
  if (!isSafeMediaPath(path)) return false;
  if (path === PUBLIC_MEDIA_PLACEHOLDER) return true;
  if (await isPublishedMedia(path)) return true;
  if (!user || (user.status && user.status !== "A")) return false;
  return columnVisible(user, path);
}

export async function canReadStoredFile(user: AccessUser, file: { id: string; createdBy: number | null }): Promise<boolean> {
  if (storedFileBypass(user, file.createdBy)) return true;
  if (await columnVisible(user, `/api/files/${file.id}`)) return true;
  return columnVisible(user, file.id);
}
