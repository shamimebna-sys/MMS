import { canBrowseTable, recordScope, type AccessUser, type RecordScope } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";

const IDENT = /^[a-z_][a-z0-9_]*$/;
export const PAGE_SIZE = 25;

export type ScopeMode =
  | { mode: "reference" }
  | { mode: "own-user"; column: string }
  | {
      mode: "column";
      candidate?: string;
      agent?: string;
      subAgent?: string;
      agencier?: string;
      companier?: string;
    }
  | { mode: "payment" }
  | { mode: "invoice" }
  | { mode: "candidate-child"; column: string };

export type ResourceDef = {
  slug: string;
  table: string;
  title: string;
  group: string;
  columns: string[];
  search: string[];
  softDelete: boolean;
  scope: ScopeMode;
  create?: "candidate" | "payment" | "party";
};

export const RESOURCES: ResourceDef[] = [
  { slug: "users", table: "users", title: "Users", group: "Administrative", columns: ["id", "name", "email", "role_id", "status"], search: ["name", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "categories", table: "categories", title: "Categories", group: "Site Monitor", columns: ["id", "name", "slug"], search: ["name", "slug"], softDelete: false, scope: { mode: "reference" } },
  { slug: "pages", table: "pages", title: "Pages", group: "Site Monitor", columns: ["id", "title", "slug", "status"], search: ["title", "slug"], softDelete: false, scope: { mode: "reference" } },
  { slug: "posts", table: "posts", title: "Posts", group: "Site Monitor", columns: ["id", "title", "slug", "status"], search: ["title", "slug"], softDelete: false, scope: { mode: "reference" } },
  { slug: "employees", table: "employees", title: "Employees", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "employers", table: "employers", title: "Employers", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "agents", table: "agents", title: "Agents", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: true, scope: { mode: "column", agent: "id" }, create: "party" },
  { slug: "companiers", table: "companiers", title: "Companies", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: true, scope: { mode: "column", companier: "id" }, create: "party" },
  { slug: "agenciers", table: "agenciers", title: "Agencys", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: true, scope: { mode: "column", agencier: "id" }, create: "party" },
  { slug: "payments", table: "payments", title: "Payment Approval", group: "Management", columns: ["id", "title", "type", "amount", "payment_date", "candidate_id", "agent_id", "currency_id", "status"], search: ["title", "invoice_no", "trx_no"], softDelete: false, scope: { mode: "payment" }, create: "payment" },
  { slug: "teachers", table: "teachers", title: "Teachers", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "mobile", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "document_types", table: "document_types", title: "Document Types", group: "Management", columns: ["id", "name", "serial_no", "status"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "candidates", table: "candidates", title: "Candidates", group: "Management", columns: ["id", "code", "name", "mobile", "passport_no", "gender", "status", "agent_id", "position"], search: ["name", "code", "mobile", "passport_no", "email"], softDelete: true, scope: { mode: "column", candidate: "id", agent: "agent_id", subAgent: "sub_agent_id", agencier: "agencier_id", companier: "companier_id" }, create: "candidate" },
  { slug: "class_groups", table: "class_groups", title: "Class Groups", group: "Management", columns: ["id", "code", "name", "fee_amount", "status"], search: ["name", "code"], softDelete: false, scope: { mode: "reference" } },
  { slug: "announcements", table: "announcements", title: "Announcements", group: "Management", columns: ["id", "topic", "status", "anounce_date", "created_at"], search: ["topic", "message"], softDelete: false, scope: { mode: "reference" } },
  { slug: "exams", table: "exams", title: "Exams", group: "Management", columns: ["id", "name", "exam_date", "exam_time", "status"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "payment_requests", table: "payment_requests", title: "Payment Requests", group: "Management", columns: ["id", "bill_title", "amount", "agent_id", "candidate_id", "status"], search: ["bill_title"], softDelete: false, scope: { mode: "column", agent: "agent_id", candidate: "candidate_id" } },
  { slug: "selected_candidates", table: "selected_candidates", title: "Banner Candidates", group: "Management", columns: ["id", "candidate_id", "position", "created_at"], search: ["position"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "positions", table: "positions", title: "Positions", group: "Management", columns: ["id", "title", "status"], search: ["title"], softDelete: false, scope: { mode: "reference" } },
  { slug: "licenses", table: "licenses", title: "Licenses", group: "Management", columns: ["id", "license_no", "companier_id", "license_expire_date", "status"], search: ["license_no"], softDelete: false, scope: { mode: "reference" } },
  { slug: "ticket_companies", table: "ticket_companies", title: "Ticket Companies", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "ticket_invoices", table: "ticket_invoices", title: "Ticket Invoices", group: "Management", columns: ["id", "invoice_no", "invoice_date", "ticket_no", "airline", "candidate_id", "total", "status"], search: ["invoice_no", "ticket_no", "bill_to_name"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "sub_agents", table: "sub_agents", title: "Sub Agents", group: "Management", columns: ["id", "code", "name", "mobile", "email", "agent_id", "status"], search: ["name", "code", "mobile", "email"], softDelete: true, scope: { mode: "column", agent: "agent_id", subAgent: "id" }, create: "party" },
  { slug: "notifications", table: "notifications", title: "Notifications", group: "Notifications", columns: ["id", "user_id", "title", "is_seen", "created_at"], search: ["title"], softDelete: false, scope: { mode: "own-user", column: "user_id" } },
  { slug: "reports", table: "reports", title: "Reports", group: "Reports", columns: ["id", "name", "status", "report_uri"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "candidate_documents", table: "candidate_documents", title: "Documents", group: "Candidate file", columns: ["id", "candidate_id", "document_no", "issue_date", "expire_date", "status", "file_path"], search: ["document_no"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "medicals", table: "medicals", title: "Medicals", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "police_clearances", table: "police_clearances", title: "Police clearance", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "visa_immigrations", table: "visa_immigrations", title: "Visas", group: "Candidate file", columns: ["id", "candidate_id", "visa_mp_no", "issue_date", "expire_date", "status"], search: ["visa_mp_no"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "labour_contracts", table: "labour_contracts", title: "Labour contracts", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "flight_schedules", table: "flight_schedules", title: "Flights", group: "Candidate file", columns: ["id", "candidate_id", "airlinece_name", "flight_date", "flight_time"], search: ["airlinece_name"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "manpower_trainings", table: "manpower_trainings", title: "Manpower training", group: "Candidate file", columns: ["id", "candidate_id", "training_start_date", "training_end_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "exam_results", table: "exam_results", title: "Exam results", group: "Candidate file", columns: ["id", "candidate_id", "exam_id", "result", "status"], search: ["remarks"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "invoices", table: "invoices", title: "Invoices", group: "Administration", columns: ["id", "invoice_no", "issue_date", "agenciers_id", "companier_id", "service", "status"], search: ["invoice_no", "owner_name", "service"], softDelete: false, scope: { mode: "invoice" } },
  { slug: "roles", table: "roles", title: "Roles", group: "Administration", columns: ["id", "name", "display_name"], search: ["name", "display_name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "live_status", table: "live_status", title: "Pipeline steps", group: "Administration", columns: ["id", "name", "status"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "districts", table: "districts", title: "Districts", group: "Administration", columns: ["id", "name", "bn_name", "division_id", "verification_status"], search: ["name", "bn_name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "audit_logs", table: "audit_logs", title: "Audit log", group: "Administration", columns: ["id", "user_id", "action", "entity_type", "entity_id", "created_at"], search: ["action", "entity_type"], softDelete: false, scope: { mode: "reference" } },
  { slug: "jobs", table: "jobs", title: "Jobs", group: "Administration", columns: ["id", "type", "status", "attempts", "created_at"], search: ["type", "status"], softDelete: false, scope: { mode: "reference" } },
];

export function getResource(slug: string): ResourceDef | undefined {
  return RESOURCES.find((resource) => resource.slug === slug);
}

export function resolveResource(slug: string): ResourceDef | undefined {
  const direct = getResource(slug);
  if (direct) return direct;
  const table = slug.replace(/-/g, "_");
  return RESOURCES.find((resource) => resource.table === table || resource.slug === table);
}

export function quoteIdent(identifier: string): string {
  if (!IDENT.test(identifier)) throw new Error("Unsafe identifier.");
  return `"${identifier}"`;
}

function scopeValue(scope: RecordScope): number | null {
  if (scope.kind === "candidate") return scope.candidateId;
  if (scope.kind === "agent") return scope.agentId;
  if (scope.kind === "subAgent") return scope.subAgentId;
  if (scope.kind === "agencier") return scope.agencierId;
  if (scope.kind === "companier") return scope.companierId;
  return null;
}

const PANEL_TABLES: Record<string, string[]> = {
  Agent: ["candidates", "payment_requests", "sub_agents", "payments", "sub_agent_payment_requests"],
  "Sub Agent": ["candidates", "payment_requests"],
  Agency: ["candidates", "invoices"],
  Agencier: ["candidates", "invoices"],
};

export function assertCanRead(user: AccessUser, resource: ResourceDef): void {
  const panel = user.roleName ? PANEL_TABLES[user.roleName] : undefined;
  if (!canBrowseTable(user, resource.table) && !panel?.includes(resource.table)) {
    throw new Error("You do not have access to this module.");
  }
}

export function visibilitySql(resource: ResourceDef, user: AccessUser, params: unknown[]): string {
  const scope = recordScope(user);
  if (scope.kind === "none") return "FALSE";
  if (resource.scope.mode === "reference" || scope.kind === "all") return "TRUE";
  if (resource.table === "payment_requests" && scope.kind === "agent") {
    params.push(scope.agentId);
    return `(agent_id = $${params.length} OR candidate_id IN (SELECT id FROM candidates WHERE agent_id = $${params.length} AND deleted_at IS NULL))`;
  }
  if (resource.table === "sub_agent_payment_requests" && scope.kind === "agent") {
    params.push(scope.agentId);
    return `(sub_agent_id IN (SELECT id FROM sub_agents WHERE agent_id = $${params.length} AND deleted_at IS NULL) OR candidate_id IN (SELECT id FROM candidates WHERE agent_id = $${params.length} AND deleted_at IS NULL))`;
  }
  if (resource.scope.mode === "own-user") {
    params.push(user.id);
    return `${quoteIdent(resource.scope.column)} = $${params.length}`;
  }
  if (resource.scope.mode === "column") {
    const column =
      scope.kind === "candidate"
        ? resource.scope.candidate
        : scope.kind === "agent"
          ? resource.scope.agent
          : scope.kind === "subAgent"
            ? resource.scope.subAgent
            : scope.kind === "agencier"
              ? resource.scope.agencier
              : scope.kind === "companier"
                ? resource.scope.companier
                : undefined;
    const value = scopeValue(scope);
    if (!column || value == null) return "FALSE";
    params.push(value);
    return `${quoteIdent(column)} = $${params.length}`;
  }
  if (resource.scope.mode === "candidate-child") {
    const column = resource.scope.column;
    if (scope.kind === "candidate") {
      params.push(scope.candidateId);
      return `${quoteIdent(column)} = $${params.length}`;
    }
    const owner =
      scope.kind === "agent"
        ? "agent_id"
        : scope.kind === "subAgent"
          ? "sub_agent_id"
          : scope.kind === "agencier"
            ? "agencier_id"
            : scope.kind === "companier"
              ? "companier_id"
              : null;
    const value = scopeValue(scope);
    if (!owner || value == null) return "FALSE";
    params.push(value);
    return `${quoteIdent(column)} IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND ${quoteIdent(owner)} = $${params.length})`;
  }
  if (resource.scope.mode === "payment") {
    if (scope.kind === "candidate") {
      params.push(scope.candidateId);
      return `${quoteIdent("candidate_id")} = $${params.length}`;
    }
    if (scope.kind === "agent") {
      params.push(scope.agentId);
      return `${quoteIdent("sub_agent_id")} IN (SELECT id FROM sub_agents WHERE agent_id = $${params.length} AND deleted_at IS NULL)`;
    }
    if (scope.kind === "subAgent") {
      params.push(scope.subAgentId);
      return `${quoteIdent("sub_agent_id")} = $${params.length}`;
    }
    return "FALSE";
  }
  if (scope.kind === "agencier") {
    params.push(scope.agencierId);
    return `${quoteIdent("agenciers_id")} = $${params.length}`;
  }
  if (scope.kind === "companier") {
    params.push(scope.companierId);
    return `${quoteIdent("companier_id")} = $${params.length}`;
  }
  if (scope.kind === "candidate" || scope.kind === "agent" || scope.kind === "subAgent") {
    const column = scope.kind === "candidate" ? "id" : scope.kind === "agent" ? "agent_id" : "sub_agent_id";
    params.push(scopeValue(scope));
    const marker = `$${params.length}`;
    return `${quoteIdent("id")} IN (SELECT invoice_id FROM invoice_candidates ic JOIN candidates c ON c.id = ic.candidate_id WHERE c.${quoteIdent(column)} = ${marker} AND c.deleted_at IS NULL)`;
  }
  return "FALSE";
}

function whereSql(resource: ResourceDef, user: AccessUser, query: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses = [visibilitySql(resource, user, params)];
  if (resource.softDelete) clauses.push(`${quoteIdent("deleted_at")} IS NULL`);
  const term = query.trim();
  if (term) {
    const parts = resource.search.map((column) => {
      params.push(`%${term}%`);
      return `${quoteIdent(column)} ILIKE $${params.length}`;
    });
    if (/^\d+$/.test(term)) {
      params.push(Number(term));
      parts.push(`${quoteIdent("id")} = $${params.length}`);
    }
    if (parts.length) clauses.push(`(${parts.join(" OR ")})`);
  }
  return { sql: clauses.join(" AND "), params };
}

export async function listRecords(resource: ResourceDef, user: AccessUser, query: string, page: number) {
  assertCanRead(user, resource);
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const where = whereSql(resource, user, query);
  const columns = resource.columns.map(quoteIdent).join(", ");
  const from = quoteIdent(resource.table);
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM (SELECT 1 FROM ${from} WHERE ${where.sql} LIMIT 1001) capped`,
    where.params,
  );
  const totalCapped = Number(countResult.rows[0]?.count ?? 0);
  const offset = (safePage - 1) * PAGE_SIZE;
  const params = where.params.slice();
  params.push(PAGE_SIZE, offset);
  const rows = await pool.query(
    `SELECT ${columns} FROM ${from} WHERE ${where.sql} ORDER BY ${quoteIdent("id")} DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    rows: rows.rows as Array<Record<string, unknown>>,
    page: safePage,
    totalCapped,
    hasMore: totalCapped > safePage * PAGE_SIZE,
  };
}

export async function exportRecords(resource: ResourceDef, user: AccessUser, query: string, limit = 5000) {
  assertCanRead(user, resource);
  const where = whereSql(resource, user, query);
  const columns = resource.columns.map(quoteIdent).join(", ");
  const params = where.params.slice();
  params.push(limit);
  const rows = await pool.query(
    `SELECT ${columns} FROM ${quoteIdent(resource.table)} WHERE ${where.sql} ORDER BY ${quoteIdent("id")} DESC LIMIT $${params.length}`,
    params,
  );
  return rows.rows as Array<Record<string, unknown>>;
}

export async function readRecord(resource: ResourceDef, user: AccessUser, id: number) {
  assertCanRead(user, resource);
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const deleted = resource.softDelete ? ` AND ${quoteIdent("deleted_at")} IS NULL` : "";
  const columns = resource.columns.map(quoteIdent).join(", ");
  const result = await pool.query(
    `SELECT ${columns} FROM ${quoteIdent(resource.table)} WHERE ${quoteIdent("id")} = $1 AND ${visibility}${deleted}`,
    params,
  );
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

export function candidateFilterSql(user: AccessUser, params: unknown[]): string {
  const scope = recordScope(user);
  if (scope.kind === "none") return "FALSE";
  if (scope.kind === "all") return `"deleted_at" IS NULL`;
  if (scope.kind === "candidate") {
    params.push(scope.candidateId);
    return `"deleted_at" IS NULL AND "id" = $${params.length}`;
  }
  const column = scope.kind === "agent" ? "agent_id" : scope.kind === "subAgent" ? "sub_agent_id" : scope.kind === "agencier" ? "agencier_id" : "companier_id";
  params.push(scopeValue(scope));
  return `"deleted_at" IS NULL AND ${quoteIdent(column)} = $${params.length}`;
}
