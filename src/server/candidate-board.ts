import type { AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { assertCanRead, candidateFilterSql, getResource } from "@/server/resources";

export const CANDIDATE_PAGE_SIZE = 15;

export type CandidateFilters = {
  q: string;
  field: string;
  group: string;
  agent: string;
  agency: string;
  company: string;
  position: string;
  page: number;
};

export type CandidateRow = {
  id: number;
  code: string;
  name: string;
  email: string;
  mobile: string;
  passportNo: string;
  status: string;
  agentLabel: string;
  groupLabel: string;
  agencyName: string;
  companyName: string;
  licensePosition: string;
  companyStatus: string;
  arcNo: string;
  visaMp: string;
  labourExpire: string;
  liveStatus: string;
  paymentLabel: string;
  photo: string;
};

export type FilterOption = { id: string; label: string };

const SEARCH_FIELDS = new Set(["name", "code", "passport_no", "mobile", "email", "status"]);

function numericId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

function whereFor(filters: CandidateFilters, user: AccessUser): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const scoped = candidateFilterSql(user, params);
  const clauses = [`c.id IN (SELECT id FROM candidates WHERE ${scoped})`];
  const agencyPanel = user.roleName === "Agency" || user.roleName === "Agencier";
  const groupId = agencyPanel ? null : numericId(filters.group);
  const agentId = agencyPanel ? null : numericId(filters.agent);
  const agencyId = numericId(filters.agency);
  const companyId = numericId(filters.company);
  const positionId = numericId(filters.position);
  if (groupId != null) {
    params.push(groupId);
    clauses.push(`c.class_group_id = $${params.length}`);
  }
  if (agentId != null) {
    params.push(agentId);
    clauses.push(`c.agent_id = $${params.length}`);
  }
  if (agencyId != null) {
    params.push(agencyId);
    clauses.push(`c.agencier_id = $${params.length}`);
  }
  if (companyId != null) {
    params.push(companyId);
    clauses.push(`c.companier_id = $${params.length}`);
  }
  if (positionId != null) {
    params.push(positionId);
    clauses.push(`c.position_id = $${params.length}`);
  }
  const term = filters.q.trim();
  if (term) {
    const field = SEARCH_FIELDS.has(filters.field) ? filters.field : "name";
    params.push(`%${term}%`);
    clauses.push(`c.${field} ILIKE $${params.length}`);
  }
  return { sql: clauses.join(" AND "), params };
}

const SELECT_LIST = `
  c.id,
  COALESCE(c.code, '') AS code,
  COALESCE(c.name, '') AS name,
  COALESCE(c.email, '') AS email,
  COALESCE(c.mobile, '') AS mobile,
  COALESCE(c.passport_no, '') AS passport_no,
  COALESCE(c.status, '') AS status,
  COALESCE(c.company_status, '') AS company_status,
  CASE WHEN a.id IS NULL THEN ''
       ELSE '(' || COALESCE(a.code, '') || ') ' || COALESCE(a.name, '') ||
            CASE WHEN NULLIF(btrim(a.mobile), '') IS NULL THEN '' ELSE ' - ' || a.mobile END
  END AS agent_label,
  CASE WHEN g.id IS NULL THEN ''
       ELSE '(' || COALESCE(g.code, '') || ') ' || COALESCE(g.name, '')
  END AS group_label,
  COALESCE(ag.name, '') AS agency_name,
  COALESCE(co.name, '') AS company_name,
  COALESCE(pos.title, NULLIF(btrim(c.position), ''), '') AS license_position,
  COALESCE((SELECT arc_number FROM arcs WHERE candidate_id = c.id ORDER BY id DESC LIMIT 1), '') AS arc_no,
  COALESCE((SELECT visa_mp_no FROM visa_immigrations WHERE candidate_id = c.id ORDER BY id DESC LIMIT 1), '') AS visa_mp,
  COALESCE((SELECT to_char(expire_date, 'YYYY-MM-DD') FROM labour_contracts WHERE candidate_id = c.id ORDER BY id DESC LIMIT 1), '') AS labour_expire,
  CASE
    WHEN EXISTS (SELECT 1 FROM flight_schedules f WHERE f.candidate_id = c.id) THEN 'Flight'
    WHEN EXISTS (SELECT 1 FROM manpower_trainings m WHERE m.candidate_id = c.id) THEN 'Manpower Status'
    WHEN EXISTS (SELECT 1 FROM visa_immigrations v WHERE v.candidate_id = c.id) THEN 'Visa'
    WHEN EXISTS (SELECT 1 FROM medicals m WHERE m.candidate_id = c.id) THEN 'Medical'
    WHEN EXISTS (SELECT 1 FROM police_clearances p WHERE p.candidate_id = c.id) THEN 'Police'
    WHEN EXISTS (SELECT 1 FROM labour_contracts l WHERE l.candidate_id = c.id) THEN 'Labour'
    WHEN EXISTS (SELECT 1 FROM selected_candidates s WHERE s.candidate_id = c.id) THEN 'Selected'
    WHEN c.class_group_id IS NOT NULL THEN 'Group'
    ELSE 'Registration'
  END AS live_status,
  CASE WHEN EXISTS (SELECT 1 FROM payments p WHERE p.candidate_id = c.id AND btrim(COALESCE(p.status, '')) = 'A') THEN 'Done' ELSE '' END AS payment_label,
  COALESCE(NULLIF(btrim(c.half_photo_file_path), ''), NULLIF(btrim(c.full_photo_file_path), ''), '') AS photo
`;

const FROM = `
  FROM candidates c
  LEFT JOIN agents a ON a.id = c.agent_id
  LEFT JOIN class_groups g ON g.id = c.class_group_id
  LEFT JOIN agenciers ag ON ag.id = c.agencier_id
  LEFT JOIN companiers co ON co.id = c.companier_id
  LEFT JOIN positions pos ON pos.id = c.position_id
`;

function mapRow(row: Record<string, unknown>): CandidateRow {
  return {
    id: Number(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    mobile: String(row.mobile ?? ""),
    passportNo: String(row.passport_no ?? ""),
    status: String(row.status ?? ""),
    agentLabel: String(row.agent_label ?? ""),
    groupLabel: String(row.group_label ?? ""),
    agencyName: String(row.agency_name ?? ""),
    companyName: String(row.company_name ?? ""),
    licensePosition: String(row.license_position ?? ""),
    companyStatus: String(row.company_status ?? ""),
    arcNo: String(row.arc_no ?? ""),
    visaMp: String(row.visa_mp ?? ""),
    labourExpire: String(row.labour_expire ?? ""),
    liveStatus: String(row.live_status ?? ""),
    paymentLabel: String(row.payment_label ?? ""),
    photo: String(row.photo ?? ""),
  };
}

async function options(sql: string, params: unknown[]): Promise<FilterOption[]> {
  const result = await pool.query(sql, params);
  return result.rows.map((row: { id: number; label: string }) => ({ id: String(row.id), label: row.label }));
}

export async function listCandidateBoard(user: AccessUser, filters: CandidateFilters) {
  const resource = getResource("candidates");
  if (!resource) throw new Error("Candidates are not configured.");
  assertCanRead(user, resource);
  const page = Number.isFinite(filters.page) && filters.page > 0 ? Math.floor(filters.page) : 1;
  const where = whereFor(filters, user);
  const scopeParams: unknown[] = [];
  const scoped = candidateFilterSql(user, scopeParams);
  const [countResult, rowsResult, groups, agents, agencies, companies, positions] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM candidates c WHERE ${where.sql}`, where.params),
    pool.query(
      `SELECT ${SELECT_LIST} ${FROM} WHERE ${where.sql} ORDER BY c.id DESC LIMIT ${CANDIDATE_PAGE_SIZE} OFFSET ${(page - 1) * CANDIDATE_PAGE_SIZE}`,
      where.params,
    ),
    options(
      `SELECT id, trim(both ' ' FROM concat_ws(' ', NULLIF('(' || code || ')', '()'), name)) AS label
       FROM class_groups
       WHERE id IN (SELECT class_group_id FROM candidates WHERE ${scoped} AND class_group_id IS NOT NULL)
       ORDER BY name NULLS LAST
       LIMIT 500`,
      scopeParams,
    ),
    options(
      `SELECT id, trim(both ' ' FROM concat_ws(' ', NULLIF('(' || code || ')', '()'), name)) AS label
       FROM agents
       WHERE deleted_at IS NULL AND id IN (SELECT agent_id FROM candidates WHERE ${scoped} AND agent_id IS NOT NULL)
       ORDER BY name NULLS LAST
       LIMIT 500`,
      scopeParams,
    ),
    options(
      `SELECT id, COALESCE(name, code, '') AS label
       FROM agenciers
       WHERE deleted_at IS NULL AND id IN (SELECT agencier_id FROM candidates WHERE ${scoped} AND agencier_id IS NOT NULL)
       ORDER BY name NULLS LAST
       LIMIT 500`,
      scopeParams,
    ),
    options(
      `SELECT id, COALESCE(name, code, '') AS label
       FROM companiers
       WHERE deleted_at IS NULL AND id IN (SELECT companier_id FROM candidates WHERE ${scoped} AND companier_id IS NOT NULL)
       ORDER BY name NULLS LAST
       LIMIT 500`,
      scopeParams,
    ),
    options(
      `SELECT id, title AS label FROM positions
       WHERE id IN (SELECT position_id FROM candidates WHERE ${scoped} AND position_id IS NOT NULL)
       ORDER BY title
       LIMIT 500`,
      scopeParams,
    ),
  ]);
  const total = Number(countResult.rows[0]?.count ?? 0);
  return {
    rows: rowsResult.rows.map((row) => mapRow(row as Record<string, unknown>)),
    page,
    total,
    pageSize: CANDIDATE_PAGE_SIZE,
    options: { groups, agents, agencies, companies, positions },
  };
}
