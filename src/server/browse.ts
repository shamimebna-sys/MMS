import { hasGrant, type AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { statusLabel } from "@/lib/utils";
import { assertCanRead, quoteIdent, resolveResource, visibilitySql, type ResourceDef, type ScopeMode } from "@/server/resources";

export const BREAD_PAGE_SIZE = 10;

export function breadPageSize(value: string | undefined): number {
  const size = Number(value);
  return size === 25 || size === 50 || size === 100 ? size : BREAD_PAGE_SIZE;
}

type RelDetails = {
  table?: string;
  type?: string;
  column?: string;
  key?: string;
  label?: string;
  pivot_table?: string;
};

type FieldRow = {
  field: string;
  type: string;
  display_name: string;
  details: string | null;
};

export type BreadColumn = { key: string; label: string };

export type BreadList = {
  title: string;
  slug: string;
  table: string;
  columns: BreadColumn[];
  rows: Array<{ id: number; cells: Record<string, string> }>;
  total: number;
  page: number;
  pageSize: number;
};

export type BreadRecord = {
  title: string;
  slug: string;
  table: string;
  id: number;
  fields: Array<{ label: string; value: string }>;
};

const IDENT = /^[a-z_][a-z0-9_]*$/;

function safe(identifier: string | undefined): string | null {
  if (!identifier || !IDENT.test(identifier)) return null;
  return identifier;
}

function singular(table: string): string {
  if (table.endsWith("ies")) return `${table.slice(0, -3)}y`;
  if (table.endsWith("s")) return table.slice(0, -1);
  return table;
}

function labelExpr(alias: string, label: string | undefined, columns: Set<string>): string {
  const quoted = (column: string) => `${alias}.${quoteIdent(column)}`;
  const pair = (code: string, name: string) =>
    `trim(both ' ' FROM concat_ws(' ', CASE WHEN ${quoted(code)} IS NULL OR btrim(${quoted(code)}::text) = '' THEN NULL ELSE '(' || ${quoted(code)}::text || ')' END, ${quoted(name)}::text))`;
  if ((label === "agent_details_info" || label === "teacher_info" || label === "candidate_details_info" || label === "group_info") && columns.has("code") && columns.has("name")) {
    return pair("code", "name");
  }
  if (label && columns.has(label)) return `${quoted(label)}::text`;
  for (const fallback of ["display_name", "name", "title", "full_name", "code"]) {
    if (columns.has(fallback)) return `${quoted(fallback)}::text`;
  }
  return `${alias}.id::text`;
}

async function columnMap(): Promise<Map<string, Set<string>>> {
  const result = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const map = new Map<string, Set<string>>();
  for (const row of result.rows as Array<{ table_name: string; column_name: string }>) {
    const set = map.get(row.table_name) ?? new Set<string>();
    set.add(row.column_name);
    map.set(row.table_name, set);
  }
  return map;
}

function scopeResource(table: string, columns: Set<string>): ResourceDef {
  const existing = resolveResource(table) ?? resolveResource(table.replace(/_/g, "-"));
  if (existing) return { ...existing, table, columns: ["id"], search: [] };
  let scope: ScopeMode = { mode: "reference" };
  if (table === "sub_agents" && columns.has("agent_id")) {
    scope = { mode: "column", candidate: "id", agent: "agent_id", subAgent: "id", agencier: "agent_id", companier: "agent_id" };
  } else if (columns.has("candidate_id")) scope = { mode: "candidate-child", column: "candidate_id" };
  else if (table === "notifications" && columns.has("user_id")) scope = { mode: "own-user", column: "user_id" };
  return { slug: table, table, title: table, group: "", columns: ["id"], search: [], softDelete: columns.has("deleted_at"), scope };
}

type SelectPiece = { key: string; label: string; sql: string; search?: string };

function piecesFor(fields: FieldRow[], table: string, columns: Map<string, Set<string>>): { selects: SelectPiece[]; joins: string[] } {
  const own = columns.get(table) ?? new Set<string>();
  const selects: SelectPiece[] = [];
  const joins: string[] = [];
  let joinIndex = 0;
  for (const field of fields) {
    if (field.type === "hidden" || field.type === "password") continue;
    const key = `c${selects.length}`;
    if (field.type === "relationship") {
      let details: RelDetails = {};
      try {
        details = field.details ? (JSON.parse(field.details) as RelDetails) : {};
      } catch {
        details = {};
      }
      const related = safe(details.table);
      const relatedColumns = related ? columns.get(related) : undefined;
      if (!related || !relatedColumns) continue;
      const label = labelExpr(`j${joinIndex}`, details.label, relatedColumns);
      if (details.type === "belongsTo") {
        const column = safe(details.column);
        const keyColumn = safe(details.key) ?? "id";
        if (!column || !own.has(column) || !relatedColumns.has(keyColumn)) continue;
        const alias = `j${joinIndex}`;
        joins.push(`LEFT JOIN ${quoteIdent(related)} ${alias} ON ${alias}.${quoteIdent(keyColumn)}::text = t.${quoteIdent(column)}::text`);
        selects.push({ key, label: field.display_name, sql: `COALESCE(${label}, '')` });
        joinIndex += 1;
        continue;
      }
      if (details.type === "belongsToMany") {
        const pivot = safe(details.pivot_table);
        const pivotColumns = pivot ? columns.get(pivot) : undefined;
        const local = pivotColumns?.has(`${singular(table)}_id`) ? `${singular(table)}_id` : null;
        const foreign = pivotColumns?.has(`${singular(related)}_id`) ? `${singular(related)}_id` : safe(details.column);
        if (!pivot || !pivotColumns || !local || !foreign || !pivotColumns.has(foreign) || !relatedColumns.has("id")) continue;
        selects.push({
          key,
          label: field.display_name,
          sql: `COALESCE((SELECT string_agg(${labelExpr("r", details.label, relatedColumns)}, ', ') FROM ${quoteIdent(pivot)} p JOIN ${quoteIdent(related)} r ON r.id::text = p.${quoteIdent(foreign)}::text WHERE p.${quoteIdent(local)}::text = t.id::text), '')`,
        });
        continue;
      }
      continue;
    }
    const column = safe(field.field);
    if (!column || !own.has(column)) continue;
    const quoted = `t.${quoteIdent(column)}`;
    const sql =
      field.type === "date" || field.type === "timestamp"
        ? `COALESCE(to_char(${quoted}, 'YYYY-MM-DD'), '')`
        : `COALESCE(${quoted}::text, '')`;
    const searchable = ["text", "email", "number", "select_dropdown", "text_area", "mobile"].includes(field.type);
    selects.push({ key, label: field.display_name, sql, search: searchable ? quoted : undefined });
  }
  return { selects, joins };
}

async function loadType(slug: string): Promise<{ id: number; slug: string; table: string; title: string } | null> {
  const result = await pool.query(
    `SELECT id, slug, name, display_name_plural
     FROM data_types
     WHERE slug = $1 OR name = $1 OR slug = replace($1, '_', '-') OR name = replace($1, '-', '_')
     LIMIT 1`,
    [slug],
  );
  const row = result.rows[0] as { id: number; slug: string; name: string; display_name_plural: string } | undefined;
  if (!row) return null;
  return { id: row.id, slug: row.slug, table: row.name, title: row.display_name_plural };
}

function formatCell(label: string, value: unknown): string {
  const text = value == null ? "" : String(value);
  if (label === "Status" || label.endsWith(" Status")) return statusLabel(text);
  return text.trim();
}

export async function listBread(
  user: AccessUser,
  slug: string,
  query: string,
  page: number,
  candidateId: number | null,
  pageSize = BREAD_PAGE_SIZE,
  examId: number | null = null,
): Promise<BreadList | null> {
  const size = pageSize === 25 || pageSize === 50 || pageSize === 100 ? pageSize : BREAD_PAGE_SIZE;
  if (slug === "media") return listMedia(user, page, size);
  if (slug === "settings") return listSettings(user, query, page, size);
  const type = await loadType(slug);
  if (!type) return null;
  const columns = await columnMap();
  const own = columns.get(type.table);
  if (!own) return null;
  const resource = scopeResource(type.table, own);
  assertCanRead(user, resource);
  const modeResult = await pool.query(
    `SELECT field, type, display_name, details FROM data_rows WHERE data_type_id = $1 AND browse = 1 ORDER BY "order", id`,
    [type.id],
  );
  const built = piecesFor(modeResult.rows as FieldRow[], type.table, columns);
  if (built.selects.length === 0) return null;
  const params: unknown[] = [];
  const visibility = visibilitySql(resource, user, params);
  const clauses = [`t.id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${visibility})`];
  if (own.has("deleted_at")) clauses.push(`t.deleted_at IS NULL`);
  if (candidateId != null && own.has("candidate_id")) {
    params.push(candidateId);
    clauses.push(`t.candidate_id = $${params.length}`);
  }
  if (examId != null && own.has("exam_id")) {
    params.push(examId);
    clauses.push(`t.exam_id = $${params.length}`);
  }
  const term = query.trim();
  if (term) {
    const parts = built.selects.flatMap((piece) => {
      if (!piece.search) return [];
      params.push(`%${term}%`);
      return [`${piece.search}::text ILIKE $${params.length}`];
    });
    if (parts.length) clauses.push(`(${parts.join(" OR ")})`);
  }
  const where = clauses.join(" AND ");
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(type.table)} t WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(size, (safePage - 1) * size);
  const listed = await pool.query(
    `SELECT t.id, ${built.selects.map((piece) => `${piece.sql} AS ${piece.key}`).join(", ")}
     FROM ${quoteIdent(type.table)} t
     ${built.joins.join("\n")}
     WHERE ${where}
     ORDER BY t.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return {
    title: type.title,
    slug: type.slug,
    table: type.table,
    columns: built.selects.map((piece) => ({ key: piece.key, label: piece.label })),
    rows: (listed.rows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      cells: Object.fromEntries(built.selects.map((piece) => [piece.key, formatCell(piece.label, row[piece.key])])),
    })),
    total: Number(count.rows[0]?.count ?? 0),
    page: safePage,
    pageSize: size,
  };
}

export async function readBread(user: AccessUser, slug: string, id: number): Promise<BreadRecord | null> {
  const type = await loadType(slug);
  if (!type) return null;
  const columns = await columnMap();
  const own = columns.get(type.table);
  if (!own?.has("id")) return null;
  const resource = scopeResource(type.table, own);
  assertCanRead(user, resource);
  const modeResult = await pool.query(
    `SELECT field, type, display_name, details FROM data_rows WHERE data_type_id = $1 AND read = 1 ORDER BY "order", id`,
    [type.id],
  );
  const fields = (modeResult.rows as FieldRow[]).filter((field) => field.type !== "password");
  const built = piecesFor(fields.length ? fields : (modeResult.rows as FieldRow[]), type.table, columns);
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const deleted = own.has("deleted_at") ? " AND t.deleted_at IS NULL" : "";
  const select = built.selects.length ? `, ${built.selects.map((piece) => `${piece.sql} AS ${piece.key}`).join(", ")}` : "";
  const result = await pool.query(
    `SELECT t.id ${select}
     FROM ${quoteIdent(type.table)} t
     ${built.joins.join("\n")}
     WHERE t.id = $1 AND t.id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${visibility})${deleted}`,
    params,
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    title: type.title,
    slug: type.slug,
    table: type.table,
    id,
    fields: built.selects.map((piece) => ({ label: piece.label, value: formatCell(piece.label, row[piece.key]) })),
  };
}

async function listSettings(user: AccessUser, query: string, page: number, pageSize: number): Promise<BreadList> {
  if (!hasGrant(user, "browse_settings")) throw new Error("You do not have access to this module.");
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const params: unknown[] = [];
  let where = "TRUE";
  if (query.trim()) {
    params.push(`%${query.trim()}%`);
    where = `(key ILIKE $1 OR display_name ILIKE $1 OR COALESCE(value, '') ILIKE $1)`;
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM settings WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(pageSize, (safePage - 1) * pageSize);
  const rows = await pool.query(
    `SELECT id, key, display_name, COALESCE("group", '') AS grp, COALESCE(value, '') AS value
     FROM settings WHERE ${where} ORDER BY "group", "order", id
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return {
    title: "Settings",
    slug: "settings",
    table: "settings",
    columns: [
      { key: "key", label: "Key" },
      { key: "display_name", label: "Display Name" },
      { key: "grp", label: "Group" },
      { key: "value", label: "Value" },
    ],
    rows: (rows.rows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      cells: { key: String(row.key ?? ""), display_name: String(row.display_name ?? ""), grp: String(row.grp ?? ""), value: String(row.value ?? "") },
    })),
    total: Number(count.rows[0]?.count ?? 0),
    page: safePage,
    pageSize,
  };
}

async function listMedia(user: AccessUser, page: number, pageSize: number): Promise<BreadList> {
  if (!hasGrant(user, "browse_media")) throw new Error("You do not have access to this module.");
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const source = `
    SELECT 'Announcement' AS source, id, file_path AS file FROM announcements WHERE COALESCE(file_path, '') <> ''
    UNION ALL
    SELECT 'Document', id, file_path FROM candidate_documents WHERE COALESCE(file_path, '') <> ''
    UNION ALL
    SELECT 'Medical', id, document_file_path FROM medicals WHERE COALESCE(document_file_path, '') <> ''
    UNION ALL
    SELECT 'Page', id, image FROM pages WHERE COALESCE(image, '') <> ''
    UNION ALL
    SELECT 'Post', id, image FROM posts WHERE COALESCE(image, '') <> ''
  `;
  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM (${source}) files`);
  const rows = await pool.query(
    `SELECT source, id, file FROM (${source}) files ORDER BY source, id DESC LIMIT $1 OFFSET $2`,
    [pageSize, (safePage - 1) * pageSize],
  );
  return {
    title: "Media",
    slug: "media",
    table: "media",
    columns: [
      { key: "source", label: "Source" },
      { key: "file", label: "File" },
    ],
    rows: (rows.rows as Array<{ source: string; id: number; file: string }>).map((row) => ({
      id: Number(row.id),
      cells: { source: row.source, file: row.file },
    })),
    total: Number(count.rows[0]?.count ?? 0),
    page: safePage,
    pageSize,
  };
}
