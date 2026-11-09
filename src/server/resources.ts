import { canBrowseTable, type AccessUser } from "@/lib/auth/permissions";
import { candidateFilterSql, quoteIdent, visibilitySql, type ScopeMode } from "@/lib/auth/row-scope";
import { pool } from "@/lib/db";

export { candidateFilterSql, quoteIdent, visibilitySql };
export type { ScopeMode };

export const PAGE_SIZE = 25;

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
  { slug: "class-schedules", table: "class_schedules", title: "Class Schedules", group: "Management", columns: ["id", "subject", "start_time", "end_time", "week_day", "status"], search: ["subject", "week_day", "status"], softDelete: false, scope: { mode: "reference" } },
  { slug: "euro-to-bdt-rates", table: "euro_to_bdt_rates", title: "Euro To BDT Rates", group: "Administration", columns: ["id", "conversion_date", "euro_rate", "created_at"], search: [], softDelete: false, scope: { mode: "reference" } },
  { slug: "currencies", table: "currencies", title: "Currencies", group: "Administration", columns: ["id", "full_name", "short_name", "symbol", "position", "status"], search: ["full_name", "short_name", "symbol"], softDelete: false, scope: { mode: "reference" } },
  { slug: "announcements", table: "announcements", title: "Announcements", group: "Management", columns: ["id", "topic", "status", "anounce_date", "created_at"], search: ["topic", "message"], softDelete: false, scope: { mode: "reference" } },
  { slug: "exams", table: "exams", title: "Exams", group: "Management", columns: ["id", "name", "exam_date", "exam_time", "status"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "payment_requests", table: "payment_requests", title: "Payment Requests", group: "Management", columns: ["id", "bill_title", "amount", "agent_id", "candidate_id", "status"], search: ["bill_title"], softDelete: false, scope: { mode: "column", agent: "agent_id", candidate: "candidate_id" } },
  { slug: "sub-agent-payment-requests", table: "sub_agent_payment_requests", title: "Sub Agent Payment Requests", group: "Management", columns: ["id", "bill_title", "sub_agent_id", "candidate_id", "amount", "status"], search: ["bill_title", "remarks"], softDelete: false, scope: { mode: "column", candidate: "candidate_id", subAgent: "sub_agent_id" } },
  { slug: "selected_candidates", table: "selected_candidates", title: "Banner Candidates", group: "Management", columns: ["id", "candidate_id", "position", "created_at"], search: ["position"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "positions", table: "positions", title: "Positions", group: "Management", columns: ["id", "title", "status"], search: ["title"], softDelete: false, scope: { mode: "reference" } },
  { slug: "licenses", table: "licenses", title: "Licenses", group: "Management", columns: ["id", "license_no", "companier_id", "license_expire_date", "status"], search: ["license_no"], softDelete: false, scope: { mode: "reference" } },
  { slug: "ticket_companies", table: "ticket_companies", title: "Ticket Companies", group: "Management", columns: ["id", "code", "name", "mobile", "email", "status"], search: ["name", "code", "email"], softDelete: false, scope: { mode: "reference" } },
  { slug: "ticket_invoices", table: "ticket_invoices", title: "Ticket Invoices", group: "Management", columns: ["id", "invoice_no", "invoice_date", "ticket_no", "airline", "candidate_id", "total", "status"], search: ["invoice_no", "ticket_no", "bill_to_name"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "ticket-invoice-money-receipts", table: "ticket_invoice_money_receipts", title: "Ticket Invoice Money Receipts", group: "Management", columns: ["id", "ticket_invoice_id", "receipt_no", "received_from", "amount", "received_for", "receipt_date", "recipient", "created_at", "payment_method", "transaction_no"], search: ["receipt_no", "received_from", "received_for", "recipient", "transaction_no"], softDelete: false, scope: { mode: "reference" } },
  { slug: "sub_agents", table: "sub_agents", title: "Sub Agents", group: "Management", columns: ["id", "code", "name", "mobile", "email", "agent_id", "status"], search: ["name", "code", "mobile", "email"], softDelete: true, scope: { mode: "column", agent: "agent_id", subAgent: "id" }, create: "party" },
  { slug: "notifications", table: "notifications", title: "Notifications", group: "Notifications", columns: ["id", "user_id", "title", "is_seen", "created_at"], search: ["title"], softDelete: false, scope: { mode: "own-user", column: "user_id" } },
  { slug: "reports", table: "reports", title: "Reports", group: "Reports", columns: ["id", "name", "status", "report_uri"], search: ["name"], softDelete: false, scope: { mode: "reference" } },
  { slug: "candidate_documents", table: "candidate_documents", title: "Documents", group: "Candidate file", columns: ["id", "candidate_id", "document_no", "issue_date", "expire_date", "status", "file_path"], search: ["document_no"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "medicals", table: "medicals", title: "Medicals", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "police_clearances", table: "police_clearances", title: "Police clearance", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "visa_immigrations", table: "visa_immigrations", title: "Visas", group: "Candidate file", columns: ["id", "candidate_id", "visa_mp_no", "issue_date", "expire_date", "status"], search: ["visa_mp_no"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "labour_contracts", table: "labour_contracts", title: "Labour contracts", group: "Candidate file", columns: ["id", "candidate_id", "issue_date", "expire_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "flight_schedules", table: "flight_schedules", title: "Flights", group: "Candidate file", columns: ["id", "candidate_id", "airlinece_name", "flight_date", "flight_time"], search: ["airlinece_name"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "arcs", table: "arcs", title: "Arcs", group: "Candidate file", columns: ["id", "candidate_id", "arc_number", "issue_date", "expire_date", "is_lifetime", "status", "acr_file_path"], search: ["arc_number", "is_lifetime", "status"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "manpower_trainings", table: "manpower_trainings", title: "Manpower training", group: "Candidate file", columns: ["id", "candidate_id", "training_start_date", "training_end_date", "status"], search: [], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "exam_results", table: "exam_results", title: "Exam results", group: "Candidate file", columns: ["id", "candidate_id", "exam_id", "result", "status"], search: ["remarks"], softDelete: false, scope: { mode: "candidate-child", column: "candidate_id" } },
  { slug: "invoices", table: "invoices", title: "Invoices", group: "Administration", columns: ["id", "invoice_no", "issue_date", "agenciers_id", "companier_id", "service", "status"], search: ["invoice_no", "owner_name", "service"], softDelete: false, scope: { mode: "invoice" } },
  { slug: "invoice-money-receipts", table: "invoice_money_receipts", title: "Money Receipts", group: "Administration", columns: ["id", "invoice_id", "receipt_no", "received_from", "hotel", "amount", "received_for", "receipt_date", "payment_method", "transaction_no"], search: ["receipt_no", "received_from", "hotel", "received_for", "recipient", "transaction_no"], softDelete: false, scope: { mode: "reference" } },
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
