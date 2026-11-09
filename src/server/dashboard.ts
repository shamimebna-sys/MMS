import type { PoolClient } from "pg";
import { recordScope, type AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { candidateFilterSql, quoteIdent } from "@/server/resources";
import { presentSelectedBanners, type SelectedBanner, type SelectedBannerRow } from "@/server/selected-banners";

export type { SelectedBanner };

export type PipelineCounts = {
  registration: number;
  profileCv: number;
  grouped: number;
  selection: number;
  labour: number;
  police: number;
  medical: number;
  visa: number;
  manpower: number;
  flight: number;
  exams: number;
};

export type MoneyTotal = { type: string; total: string };

export type RosterCounts = { students: number; teachers: number; agents: number; employees: number };

export type ScheduleRow = { title: string; when: string; detail: string };

export type DashboardData = {
  pipeline: PipelineCounts;
  money: MoneyTotal[];
  agentBalance: string;
  totalCandidates: number;
  totalAgents: number;
  selected: SelectedBanner[];
  roster: RosterCounts | null;
  classes: ScheduleRow[];
  interviews: ScheduleRow[];
  flights: ScheduleRow[];
  announcements: Array<{ topic: string; date: string; file: string }>;
};

type DashboardSql = {
  query: PoolClient["query"];
};

/**
 * One pool checkout for every dashboard metric statement.
 * READ ONLY keeps the default isolation level and rejects writes.
 * Each statement still sees its own READ COMMITTED snapshot.
 */
async function withDashboardRead<T>(read: (db: DashboardSql) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let released = false;
  const release = (error?: Error) => {
    if (released) return;
    released = true;
    client.release(error);
  };
  try {
    await client.query("BEGIN READ ONLY");
    const value = await read(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      release(rollbackError instanceof Error ? rollbackError : new Error("Dashboard read rollback failed."));
    }
    throw error;
  } finally {
    release();
  }
}

type FlightJsonRow = { title: string; when_label: string; detail: string };

function jsonRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [];
}

function pipelineFrom(row: Record<string, unknown> | undefined): PipelineCounts {
  return {
    registration: Number(row?.registration ?? 0),
    profileCv: Number(row?.profile_cv ?? 0),
    grouped: Number(row?.grouped ?? 0),
    selection: Number(row?.selection ?? 0),
    labour: Number(row?.labour ?? 0),
    police: Number(row?.police ?? 0),
    medical: Number(row?.medical ?? 0),
    visa: Number(row?.visa ?? 0),
    manpower: Number(row?.manpower ?? 0),
    flight: Number(row?.flight ?? 0),
    exams: Number(row?.exams ?? 0),
  };
}

/**
 * Pipeline counts, banner rows, and upcoming flights share one materialized candidate scan.
 * Registration, profile/CV, and grouped are one aggregate over that scan.
 * Selection, labour, police, medical, visa, manpower, and flight share one join to scoped.id.
 * Exam results stay on their own candidate_id lookup. Selection count is every matching row.
 * Banners keep the newest row per candidate.
 */
async function scopedCandidateMetrics(
  db: DashboardSql,
  user: AccessUser,
): Promise<{ pipeline: PipelineCounts; selected: SelectedBanner[]; flights: ScheduleRow[] }> {
  const params: unknown[] = [];
  const filter = candidateFilterSql(user, params);
  const result = await db.query(
    `WITH scoped AS MATERIALIZED (
       SELECT id, name, passport_no, position, half_photo_file_path, full_photo_file_path, cv_file_path, class_group_id
       FROM candidates
       WHERE ${filter}
     ),
     child_counts AS (
       SELECT
         COUNT(*) FILTER (WHERE kind = 'selection')::int AS selection,
         COUNT(*) FILTER (WHERE kind = 'labour')::int AS labour,
         COUNT(*) FILTER (WHERE kind = 'police')::int AS police,
         COUNT(*) FILTER (WHERE kind = 'medical')::int AS medical,
         COUNT(*) FILTER (WHERE kind = 'visa')::int AS visa,
         COUNT(*) FILTER (WHERE kind = 'manpower')::int AS manpower,
         COUNT(*) FILTER (WHERE kind = 'flight')::int AS flight
       FROM (
         SELECT 'selection'::text AS kind, candidate_id AS candidate_id FROM selected_candidates
         UNION ALL
         SELECT 'labour'::text, candidate_id FROM labour_contracts
         UNION ALL
         SELECT 'police'::text, candidate_id FROM police_clearances
         UNION ALL
         SELECT 'medical'::text, candidate_id FROM medicals
         UNION ALL
         SELECT 'visa'::text, candidate_id FROM visa_immigrations
         UNION ALL
         SELECT 'manpower'::text, candidate_id FROM manpower_trainings
         UNION ALL
         SELECT 'flight'::text, candidate_id FROM flight_schedules
       ) child
       JOIN scoped ON scoped.id = child.candidate_id
     ),
     base_counts AS (
       SELECT
         COUNT(*)::int AS registration,
         COUNT(*) FILTER (WHERE cv_file_path IS NOT NULL AND btrim(cv_file_path) <> '')::int AS profile_cv,
         COUNT(*) FILTER (WHERE class_group_id IS NOT NULL)::int AS grouped
       FROM scoped
     )
     SELECT
       base_counts.registration,
       base_counts.profile_cv,
       base_counts.grouped,
       child_counts.selection,
       child_counts.labour,
       child_counts.police,
       child_counts.medical,
       child_counts.visa,
       child_counts.manpower,
       child_counts.flight,
       (SELECT COUNT(*)::int FROM exam_results t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS exams,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'id', b.id,
               'name', b.name,
               'position', b.position,
               'passport_no', b.passport_no,
               'photo', b.photo
             )
             ORDER BY b.selection_id DESC
           )
           FROM (
             SELECT DISTINCT ON (c.id)
               c.id,
               c.name,
               c.passport_no,
               COALESCE(NULLIF(btrim(s.position), ''), NULLIF(btrim(c.position), ''), '') AS position,
               COALESCE(NULLIF(btrim(c.half_photo_file_path), ''), NULLIF(btrim(c.full_photo_file_path), ''), '') AS photo,
               s.id AS selection_id
             FROM selected_candidates s
             JOIN scoped c ON c.id = s.candidate_id
             ORDER BY c.id, s.id DESC
           ) b
         ),
         '[]'::json
       ) AS banners,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'title', f.title,
               'when_label', f.when_label,
               'detail', f.detail
             )
             ORDER BY f.ordinal
           )
           FROM (
             SELECT
               COALESCE(f.airlinece_name, 'Flight') AS title,
               concat_ws(' ', to_char(f.flight_date, 'YYYY-MM-DD'), NULLIF(f.flight_time, '')) AS when_label,
               COALESCE(c.name, '') AS detail,
               row_number() OVER (ORDER BY f.flight_date NULLS LAST) AS ordinal
             FROM flight_schedules f
             JOIN scoped c ON c.id = f.candidate_id
             WHERE f.flight_date IS NULL OR f.flight_date >= CURRENT_DATE
             ORDER BY ordinal
             LIMIT 8
           ) f
         ),
         '[]'::json
       ) AS flights
     FROM base_counts
     CROSS JOIN child_counts`,
    params,
  );
  const row = (result.rows[0] ?? undefined) as Record<string, unknown> | undefined;
  return {
    pipeline: pipelineFrom(row),
    selected: presentSelectedBanners(jsonRows<SelectedBannerRow>(row?.banners)),
    flights: jsonRows<FlightJsonRow>(row?.flights).map((item) => ({
      title: item.title,
      when: item.when_label,
      detail: item.detail,
    })),
  };
}

async function moneyTotals(db: DashboardSql, user: AccessUser): Promise<MoneyTotal[]> {
  const scope = recordScope(user);
  let moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE FALSE GROUP BY type`;
  let moneyParams: unknown[] = [];
  if (scope.kind === "all") {
    moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments GROUP BY type ORDER BY type`;
  } else if (scope.kind === "candidate") {
    moneyParams = [scope.candidateId];
    moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id = $1 GROUP BY type ORDER BY type`;
  } else if (scope.kind === "agent") {
    moneyParams = [scope.agentId];
    moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE agent_id = $1 OR candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND agent_id = $1) GROUP BY type ORDER BY type`;
  } else if (scope.kind === "subAgent" || scope.kind === "agencier" || scope.kind === "companier") {
    const column = scope.kind === "subAgent" ? "sub_agent_id" : scope.kind === "agencier" ? "agencier_id" : "companier_id";
    const value = scope.kind === "subAgent" ? scope.subAgentId : scope.kind === "agencier" ? scope.agencierId : scope.companierId;
    moneyParams = [value];
    moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND ${quoteIdent(column)} = $1) GROUP BY type ORDER BY type`;
  }
  const moneyResult = await db.query(moneySql, moneyParams);
  return moneyResult.rows.map((item: { type: string; total: string }) => ({ type: item.type.trim(), total: item.total }));
}

export async function loadShellHeader(userId: number): Promise<{ unread: number }> {
  const notes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND COALESCE(btrim(is_seen), '') NOT IN ('1', 'Y', 'A')`,
    [userId],
  );
  return { unread: Number(notes.rows[0]?.count ?? 0) };
}

async function readDashboard(db: DashboardSql, user: AccessUser): Promise<DashboardData> {
  const scope = recordScope(user);
  const scoped = await scopedCandidateMetrics(db, user);
  const money = await moneyTotals(db, user);

  let balanceSql = `SELECT COALESCE(SUM(balance), 0)::text AS balance FROM agents WHERE deleted_at IS NULL`;
  let balanceParams: unknown[] = [];
  let agentCountSql = `SELECT COUNT(*)::int AS count FROM agents WHERE deleted_at IS NULL`;
  let agentCountParams: unknown[] = [];
  if (scope.kind === "agent") {
    balanceSql = `SELECT COALESCE(balance, 0)::text AS balance FROM agents WHERE id = $1 AND deleted_at IS NULL`;
    balanceParams = [scope.agentId];
    agentCountSql = `SELECT COUNT(*)::int AS count FROM sub_agents WHERE agent_id = $1 AND deleted_at IS NULL`;
    agentCountParams = [scope.agentId];
  } else if (scope.kind === "subAgent") {
    balanceSql = `SELECT COALESCE(balance, 0)::text AS balance FROM sub_agents WHERE id = $1 AND deleted_at IS NULL`;
    balanceParams = [scope.subAgentId];
    agentCountSql = `SELECT 1::int AS count`;
  } else if (user.roleName === "Agent" || user.roleName === "Sub Agent") {
    balanceSql = `SELECT 0::text AS balance`;
    balanceParams = [];
  }

  const balanceResult = await db.query(balanceSql, balanceParams);
  const agentResult = await db.query(agentCountSql, agentCountParams);
  const classResult = await db.query(
    `SELECT COALESCE(subject, 'Class') AS title,
            trim(both ' ' FROM concat_ws(' ', NULLIF(week_day, ''), NULLIF(start_time, ''), NULLIF(end_time, ''))) AS when_label
     FROM class_schedules
     WHERE lower(COALESCE(week_day, '')) = lower(to_char(CURRENT_DATE, 'FMDay'))
        OR week_day = to_char(CURRENT_DATE, 'ID')
     ORDER BY start_time
     LIMIT 8`,
  );
  const examResult = await db.query(
    `SELECT COALESCE(name, 'Interview') AS title,
            concat_ws(' ', to_char(exam_date, 'YYYY-MM-DD'), NULLIF(exam_time, '')) AS when_label
     FROM exams
     WHERE exam_date >= CURRENT_DATE
     ORDER BY exam_date, exam_time
     LIMIT 8`,
  );
  const announcementResult = await db.query(
    `SELECT COALESCE(topic, '') AS topic,
            COALESCE(to_char(anounce_date, 'YYYY-MM-DD'), '') AS date,
            COALESCE(file_path, '') AS file
     FROM announcements
     ORDER BY anounce_date DESC NULLS LAST, id DESC
     LIMIT 8`,
  );
  const rosterResult =
    scope.kind === "all"
      ? await db.query(
          `SELECT
             (SELECT COUNT(*)::int FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Teacher' AND COALESCE(u.status, '') LIKE 'A%') AS teachers,
             (SELECT COUNT(*)::int FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Employee' AND COALESCE(u.status, '') LIKE 'A%') AS employees`,
        )
      : { rows: [] as Array<{ teachers: number; employees: number }> };

  return {
    pipeline: scoped.pipeline,
    money,
    agentBalance: String(balanceResult.rows[0]?.balance ?? "0"),
    totalCandidates: scoped.pipeline.registration,
    totalAgents: Number(agentResult.rows[0]?.count ?? 0),
    selected: scoped.selected,
    roster:
      scope.kind === "all"
        ? {
            students: scoped.pipeline.registration,
            teachers: Number(rosterResult.rows[0]?.teachers ?? 0),
            agents: Number(agentResult.rows[0]?.count ?? 0),
            employees: Number(rosterResult.rows[0]?.employees ?? 0),
          }
        : null,
    classes: classResult.rows.map((row: { title: string; when_label: string }) => ({
      title: row.title,
      when: row.when_label,
      detail: "",
    })),
    interviews: examResult.rows.map((row: { title: string; when_label: string }) => ({
      title: row.title,
      when: row.when_label,
      detail: "",
    })),
    flights: scoped.flights,
    announcements: announcementResult.rows.map((row: { topic: string; date: string; file: string }) => ({
      topic: row.topic,
      date: row.date,
      file: row.file,
    })),
  };
}

export async function loadDashboard(user: AccessUser): Promise<DashboardData> {
  return withDashboardRead((db) => readDashboard(db, user));
}
