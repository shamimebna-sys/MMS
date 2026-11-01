import { recordScope, type AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import { candidateFilterSql, quoteIdent } from "@/server/resources";
import { uniqueSelectedBanners, type SelectedBanner, type SelectedBannerRow } from "@/server/selected-banners";

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

async function pipelineCounts(user: AccessUser): Promise<PipelineCounts> {
  const params: unknown[] = [];
  const filter = candidateFilterSql(user, params);
  const pipelineResult = await pool.query(
    `WITH scoped AS (SELECT id FROM candidates WHERE ${filter})
     SELECT
       (SELECT COUNT(*)::int FROM scoped) AS registration,
       (SELECT COUNT(*)::int FROM candidates c WHERE c.id IN (SELECT id FROM scoped) AND c.cv_file_path IS NOT NULL AND btrim(c.cv_file_path) <> '') AS profile_cv,
       (SELECT COUNT(*)::int FROM candidates c WHERE c.id IN (SELECT id FROM scoped) AND c.class_group_id IS NOT NULL) AS grouped,
       (SELECT COUNT(*)::int FROM selected_candidates s WHERE s.candidate_id IN (SELECT id FROM scoped)) AS selection,
       (SELECT COUNT(*)::int FROM labour_contracts t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS labour,
       (SELECT COUNT(*)::int FROM police_clearances t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS police,
       (SELECT COUNT(*)::int FROM medicals t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS medical,
       (SELECT COUNT(*)::int FROM visa_immigrations t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS visa,
       (SELECT COUNT(*)::int FROM manpower_trainings t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS manpower,
       (SELECT COUNT(*)::int FROM flight_schedules t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS flight,
       (SELECT COUNT(*)::int FROM exam_results t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS exams`,
    params,
  );
  const row = pipelineResult.rows[0] ?? {};
  return {
    registration: Number(row.registration ?? 0),
    profileCv: Number(row.profile_cv ?? 0),
    grouped: Number(row.grouped ?? 0),
    selection: Number(row.selection ?? 0),
    labour: Number(row.labour ?? 0),
    police: Number(row.police ?? 0),
    medical: Number(row.medical ?? 0),
    visa: Number(row.visa ?? 0),
    manpower: Number(row.manpower ?? 0),
    flight: Number(row.flight ?? 0),
    exams: Number(row.exams ?? 0),
  };
}

async function moneyTotals(user: AccessUser): Promise<MoneyTotal[]> {
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
  } else if (scope.kind !== "none") {
    const column = scope.kind === "subAgent" ? "sub_agent_id" : scope.kind === "agencier" ? "agencier_id" : "companier_id";
    const value = scope.kind === "subAgent" ? scope.subAgentId : scope.kind === "agencier" ? scope.agencierId : scope.companierId;
    moneyParams = [value];
    moneySql = `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND ${quoteIdent(column)} = $1) GROUP BY type ORDER BY type`;
  }
  const moneyResult = await pool.query(moneySql, moneyParams);
  return moneyResult.rows.map((item: { type: string; total: string }) => ({ type: item.type.trim(), total: item.total }));
}

export async function loadShellHeader(userId: number): Promise<{ unread: number }> {
  const notes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND COALESCE(btrim(is_seen), '') NOT IN ('1', 'Y', 'A')`,
    [userId],
  );
  return { unread: Number(notes.rows[0]?.count ?? 0) };
}

export async function loadDashboard(user: AccessUser): Promise<DashboardData> {
  const scope = recordScope(user);
  const pipeline = await pipelineCounts(user);
  const money = await moneyTotals(user);

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
  }

  const params: unknown[] = [];
  const filter = candidateFilterSql(user, params);
  const [balanceResult, agentResult, selectedResult, classResult, examResult, flightResult, announcementResult, rosterResult] = await Promise.all([
    pool.query(balanceSql, balanceParams),
    pool.query(agentCountSql, agentCountParams),
    pool.query(
      `SELECT c.id, c.name, c.passport_no,
              COALESCE(NULLIF(btrim(s.position), ''), NULLIF(btrim(c.position), ''), '') AS position,
              COALESCE(NULLIF(btrim(c.half_photo_file_path), ''), NULLIF(btrim(c.full_photo_file_path), ''), '') AS photo
       FROM selected_candidates s
       JOIN candidates c ON c.id = s.candidate_id
       WHERE c.id IN (SELECT id FROM candidates WHERE ${filter})
       ORDER BY s.id DESC`,
      params,
    ),
    pool.query(
      `SELECT COALESCE(subject, 'Class') AS title,
              trim(both ' ' FROM concat_ws(' ', NULLIF(week_day, ''), NULLIF(start_time, ''), NULLIF(end_time, ''))) AS when_label
       FROM class_schedules
       WHERE lower(COALESCE(week_day, '')) = lower(to_char(CURRENT_DATE, 'FMDay'))
          OR week_day = to_char(CURRENT_DATE, 'ID')
       ORDER BY start_time
       LIMIT 8`,
    ),
    pool.query(
      `SELECT COALESCE(name, 'Interview') AS title,
              concat_ws(' ', to_char(exam_date, 'YYYY-MM-DD'), NULLIF(exam_time, '')) AS when_label
       FROM exams
       WHERE exam_date >= CURRENT_DATE
       ORDER BY exam_date, exam_time
       LIMIT 8`,
    ),
    pool.query(
      `SELECT COALESCE(f.airlinece_name, 'Flight') AS title,
              concat_ws(' ', to_char(f.flight_date, 'YYYY-MM-DD'), NULLIF(f.flight_time, '')) AS when_label,
              COALESCE(c.name, '') AS detail
       FROM flight_schedules f
       JOIN candidates c ON c.id = f.candidate_id
       WHERE c.id IN (SELECT id FROM candidates WHERE ${filter})
         AND (f.flight_date IS NULL OR f.flight_date >= CURRENT_DATE)
       ORDER BY f.flight_date NULLS LAST
       LIMIT 8`,
      params,
    ),
    pool.query(
      `SELECT COALESCE(topic, '') AS topic,
              COALESCE(to_char(anounce_date, 'YYYY-MM-DD'), '') AS date,
              COALESCE(file_path, '') AS file
       FROM announcements
       ORDER BY anounce_date DESC NULLS LAST, id DESC
       LIMIT 8`,
    ),
    scope.kind === "all"
      ? pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Teacher' AND COALESCE(u.status, '') LIKE 'A%') AS teachers,
             (SELECT COUNT(*)::int FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'Employee' AND COALESCE(u.status, '') LIKE 'A%') AS employees`,
        )
      : Promise.resolve({ rows: [] as Array<{ teachers: number; employees: number }> }),
  ]);

  return {
    pipeline,
    money,
    agentBalance: String(balanceResult.rows[0]?.balance ?? "0"),
    totalCandidates: pipeline.registration,
    totalAgents: Number(agentResult.rows[0]?.count ?? 0),
    selected: uniqueSelectedBanners(selectedResult.rows as SelectedBannerRow[]),
    roster:
      scope.kind === "all"
        ? {
            students: pipeline.registration,
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
    flights: flightResult.rows.map((row: { title: string; when_label: string; detail: string }) => ({
      title: row.title,
      when: row.when_label,
      detail: row.detail,
    })),
    announcements: announcementResult.rows.map((row: { topic: string; date: string; file: string }) => ({
      topic: row.topic,
      date: row.date,
      file: row.file,
    })),
  };
}
