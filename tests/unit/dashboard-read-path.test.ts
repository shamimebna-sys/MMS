import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { candidateFilterSql } from "@/lib/auth/row-scope";
import { loadDashboard, loadShellHeader, type DashboardData } from "@/server/dashboard";

/**
 * Unit tests. The pool is a mock. No PostgreSQL connection is opened.
 */

const harness = vi.hoisted(() => {
  const state = {
    failMarker: "",
    failRollback: false,
    failCommit: false,
    empty: false,
    noCandidates: false,
    bannerCount: 0,
    queries: [] as Array<{ sql: string; params: unknown[] | undefined; client: number }>,
    poolQueries: [] as Array<{ sql: string; params: unknown[] | undefined }>,
    releases: [] as Array<{ client: number; error: unknown }>,
    clients: 0,
    inflight: 0,
    maxInflight: 0,
    dead: new Set<number>(),
  };

  function bannerRows(): Array<Record<string, unknown>> {
    if (state.bannerCount > 0) {
      return Array.from({ length: state.bannerCount }, (_, index) => ({
        id: index + 1,
        name: `Banner ${index + 1}`,
        position: "Trade",
        passport_no: `P${index + 1}`,
        photo: "",
      }));
    }
    return [
      { id: 1, name: " Ada ", position: " Welder ", passport_no: " P1 ", photo: " ada.jpg " },
      { id: 2, name: null, position: null, passport_no: null, photo: null },
    ];
  }

  function rowsFor(sql: string): { rows: Array<Record<string, unknown>> } {
    if (sql.includes("WITH scoped")) {
      if (state.noCandidates) {
        return {
          rows: [
            {
              registration: 0,
              profile_cv: 0,
              grouped: 0,
              selection: 0,
              labour: 0,
              police: 0,
              medical: 0,
              visa: 0,
              manpower: 0,
              flight: 0,
              exams: 0,
              banners: [],
              flights: [],
            },
          ],
        };
      }
      return {
        rows: [
          {
            registration: 11,
            profile_cv: 2,
            grouped: 3,
            selection: 4,
            labour: 5,
            police: 6,
            medical: 7,
            visa: 8,
            manpower: 9,
            flight: 10,
            exams: 12,
            banners: bannerRows(),
            flights: [{ title: "Future Air", when_label: "2026-11-08", detail: "Ada" }],
          },
        ],
      };
    }
    if (sql.includes("FROM payments")) {
      return { rows: [{ type: "  fee  ", total: "10.50" }, { type: "", total: "1" }] };
    }
    if (sql === "SELECT 0::text AS balance") return { rows: [{ balance: "0" }] };
    if (sql.includes("AS balance")) return { rows: [{ balance: "42.00" }] };
    if (sql.includes("SELECT 1::int AS count")) return { rows: [{ count: 1 }] };
    if (sql.includes("AS count")) return { rows: [{ count: 6 }] };
    if (sql.includes("FROM selected_candidates")) {
      return {
        rows: [
          { id: 1, name: " Ada ", position: " Welder ", passport_no: " P1 ", photo: " ada.jpg " },
          { id: 1, name: "Older", position: "Old", passport_no: "P", photo: "" },
          { id: 2, name: null, position: null, passport_no: null, photo: null },
        ],
      };
    }
    if (sql.includes("FROM class_schedules")) return { rows: [{ title: "Math", when_label: "Sunday 09:00" }] };
    if (sql.includes("FROM exams")) return { rows: [{ title: "Panel", when_label: "2026-11-08 10:00" }] };
    if (sql.includes("FROM flight_schedules f")) return { rows: [{ title: "Future Air", when_label: "2026-11-08", detail: "Ada" }] };
    if (sql.includes("FROM announcements")) return { rows: [{ topic: "Hello", date: "2026-11-01", file: "a.png" }] };
    if (sql.includes("AS teachers")) return { rows: [{ teachers: 3, employees: 4 }] };
    return { rows: [] };
  }

  return { state, rowsFor };
});

vi.mock("@/lib/db", () => ({
  pool: {
    connect: async () => {
      harness.state.clients += 1;
      const id = harness.state.clients;
      return {
        query: async (sql: string, params?: unknown[]) => {
          if (harness.state.dead.has(id)) throw new Error(`client ${id} used after release`);
          harness.state.inflight += 1;
          harness.state.maxInflight = Math.max(harness.state.maxInflight, harness.state.inflight);
          try {
            await Promise.resolve();
            harness.state.queries.push({ sql, params, client: id });
            if (sql === "ROLLBACK" && harness.state.failRollback) throw new Error("rollback failed");
            if (sql === "COMMIT" && harness.state.failCommit) throw new Error("commit failed");
            if (harness.state.failMarker && sql.includes(harness.state.failMarker)) throw new Error("metric query failed");
            if (sql === "BEGIN READ ONLY" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
            if (harness.state.empty) return { rows: [] };
            return harness.rowsFor(sql);
          } finally {
            harness.state.inflight -= 1;
          }
        },
        release: (error?: Error) => {
          if (harness.state.dead.has(id)) throw new Error(`client ${id} released twice`);
          harness.state.dead.add(id);
          harness.state.releases.push({ client: id, error });
        },
      };
    },
    query: async (sql: string, params?: unknown[]) => {
      harness.state.poolQueries.push({ sql, params });
      return { rows: [{ count: 4 }] };
    },
  },
}));

const GLOBAL_BALANCE = `SELECT COALESCE(SUM(balance), 0)::text AS balance FROM agents WHERE deleted_at IS NULL`;
const GLOBAL_COUNT = `SELECT COUNT(*)::int AS count FROM agents WHERE deleted_at IS NULL`;
const ZERO_BALANCE = `SELECT 0::text AS balance`;
const WRITE = /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|comment|vacuum|reindex|merge)\b/i;

function user(partial: Partial<AccessUser> & Pick<AccessUser, "roleName">): AccessUser {
  return {
    id: 1,
    name: "Tester",
    roleName: partial.roleName,
    permissions: partial.permissions ?? [],
    agentId: partial.agentId ?? null,
    subAgentId: partial.subAgentId ?? null,
    candidateId: partial.candidateId ?? null,
    agencierId: partial.agencierId ?? null,
    companierId: partial.companierId ?? null,
    status: partial.status === undefined ? "A" : partial.status,
  };
}

function clientQueries(client = harness.state.clients) {
  return harness.state.queries.filter((query) => query.client === client);
}

function metricQueries(client = harness.state.clients) {
  return clientQueries(client).filter(
    (query) => query.sql !== "BEGIN READ ONLY" && query.sql !== "COMMIT" && query.sql !== "ROLLBACK",
  );
}

function sqlMatching(part: string) {
  const found = metricQueries().filter((query) => query.sql.includes(part));
  expect(found, part).toHaveLength(1);
  return found[0];
}

function expectOneCheckout(dataQueries: number) {
  expect(harness.state.clients).toBe(1);
  expect(harness.state.poolQueries).toEqual([]);
  expect(harness.state.maxInflight).toBe(1);
  expect(harness.state.releases).toEqual([{ client: 1, error: undefined }]);
  expect(harness.state.dead.has(1)).toBe(true);
  const queries = clientQueries();
  expect(queries.every((query) => query.client === 1)).toBe(true);
  expect(queries[0]?.sql).toBe("BEGIN READ ONLY");
  expect(queries.at(-1)?.sql).toBe("COMMIT");
  expect(queries.some((query) => query.sql === "ROLLBACK")).toBe(false);
  expect(metricQueries()).toHaveLength(dataQueries);
  expect(queries.some((query) => WRITE.test(query.sql.replace(/'(?:''|[^'])*'/g, "''")))).toBe(false);
  expect(queries.some((query) => /serializable|repeatable\s+read/i.test(query.sql))).toBe(false);
}

const SEVEN_COUNT_TABLES = [
  ["selection", "selected_candidates"],
  ["labour", "labour_contracts"],
  ["police", "police_clearances"],
  ["medical", "medicals"],
  ["visa", "visa_immigrations"],
  ["manpower", "manpower_trainings"],
  ["flight", "flight_schedules"],
] as const;

function expectSevenTableUnion(sql: string) {
  const childAt = sql.indexOf("child_counts AS");
  const baseAt = sql.indexOf("base_counts AS");
  expect(childAt).toBeGreaterThan(-1);
  expect(baseAt).toBeGreaterThan(childAt);
  const unionBody = sql.slice(childAt, baseAt);
  expect(unionBody.match(/UNION ALL/g)).toHaveLength(SEVEN_COUNT_TABLES.length - 1);
  for (const [kind, table] of SEVEN_COUNT_TABLES) {
    expect(unionBody).toContain(`FROM ${table}`);
    expect(unionBody).toContain(`COUNT(*) FILTER (WHERE kind = '${kind}')`);
  }
  expect(unionBody).toContain("JOIN scoped ON scoped.id = child.candidate_id");
  expect(unionBody).not.toContain("exam_results");
  expect(sql).toContain("(SELECT COUNT(*)::int FROM exam_results t WHERE t.candidate_id IN (SELECT id FROM scoped)) AS exams");
  expect(sql.indexOf("FROM exam_results")).toBeGreaterThan(baseAt);
  expect(sql).toContain("FROM base_counts");
  expect(sql).toContain("CROSS JOIN child_counts");
}

function expectCandidatePredicate(account: AccessUser) {
  const params: unknown[] = [];
  const filter = candidateFilterSql(account, params);
  const scoped = sqlMatching("WITH scoped AS MATERIALIZED");
  expect(scoped?.params).toEqual(params);
  expect(scoped?.sql.split(filter).length - 1).toBe(1);
  expect(scoped?.sql.match(/FROM candidates/g)).toEqual(["FROM candidates"]);
  expectSevenTableUnion(scoped?.sql ?? "");
  expect(scoped?.sql).toContain("DISTINCT ON (c.id)");
  expect(scoped?.sql).toContain("ORDER BY c.id, s.id DESC");
  expect(scoped?.sql).toContain("ORDER BY b.selection_id DESC");
  expect(scoped?.sql).not.toContain("COUNT(DISTINCT");
  const bannerAt = scoped?.sql.indexOf("DISTINCT ON (c.id)") ?? -1;
  const flightAt = scoped?.sql.indexOf("FROM flight_schedules f") ?? -1;
  expect(bannerAt).toBeGreaterThan(-1);
  expect(flightAt).toBeGreaterThan(bannerAt);
  expect(scoped?.sql.slice(bannerAt, flightAt)).not.toMatch(/LIMIT/i);
  expect(scoped?.sql.slice(flightAt)).toContain("LIMIT 8");
  expect(scoped?.sql).toContain("JOIN scoped c ON c.id = s.candidate_id");
  expect(scoped?.sql).toContain("JOIN scoped c ON c.id = f.candidate_id");
}

describe("dashboard metric read path (unit, mocks only)", () => {
  const full = user({ roleName: "sadmin" });

  beforeEach(() => {
    harness.state.failMarker = "";
    harness.state.failRollback = false;
    harness.state.failCommit = false;
    harness.state.empty = false;
    harness.state.noCandidates = false;
    harness.state.bannerCount = 0;
    harness.state.queries = [];
    harness.state.poolQueries = [];
    harness.state.releases = [];
    harness.state.clients = 0;
    harness.state.inflight = 0;
    harness.state.maxInflight = 0;
    harness.state.dead = new Set();
  });

  it("runs every full-access metric on one client and does not call pool.query", async () => {
    const data = await loadDashboard(full);
    expectOneCheckout(8);
    expect(sqlMatching("AS teachers")?.params).toBeUndefined();
    expect(data.pipeline).toEqual({
      registration: 11,
      profileCv: 2,
      grouped: 3,
      selection: 4,
      labour: 5,
      police: 6,
      medical: 7,
      visa: 8,
      manpower: 9,
      flight: 10,
      exams: 12,
    });
    expect(data.pipeline.selection).toBe(4);
    expect(data.selected).toHaveLength(2);
    expect(data.selected.map((banner) => banner.id)).toEqual([1, 2]);
    expect(data.selected[0]).toMatchObject({ name: "Ada", position: "Welder", passportNo: "P1", photo: "ada.jpg" });
    expect(data.money).toEqual([
      { type: "fee", total: "10.50" },
      { type: "", total: "1" },
    ]);
    expect(data.agentBalance).toBe("42.00");
    expect(data.totalCandidates).toBe(11);
    expect(data.totalAgents).toBe(6);
    expect(data.roster).toEqual({ students: 11, teachers: 3, agents: 6, employees: 4 });
    expect(data.classes).toEqual([{ title: "Math", when: "Sunday 09:00", detail: "" }]);
    expect(data.interviews).toEqual([{ title: "Panel", when: "2026-11-08 10:00", detail: "" }]);
    expect(data.flights).toEqual([{ title: "Future Air", when: "2026-11-08", detail: "Ada" }]);
    expect(data.announcements).toEqual([{ topic: "Hello", date: "2026-11-01", file: "a.png" }]);
  });

  it("checks out a new client for a later request and does not reuse a released client", async () => {
    await loadDashboard(full);
    await loadDashboard(full);
    expect(harness.state.clients).toBe(2);
    expect(harness.state.releases.map((release) => release.client)).toEqual([1, 2]);
    expect(harness.state.poolQueries).toEqual([]);
    expect(clientQueries(2)[0]?.sql).toBe("BEGIN READ ONLY");
    expect(clientQueries(2).every((query) => query.client === 2)).toBe(true);
    expect(harness.state.dead.has(1)).toBe(true);
    expect(harness.state.dead.has(2)).toBe(true);
  });

  it("releases the client once when a metric query fails and rolls the read-only transaction back", async () => {
    harness.state.failMarker = "FROM payments";
    const failure = loadDashboard(full);
    await expect(failure).rejects.toThrow("metric query failed");
    expect(harness.state.clients).toBe(1);
    expect(harness.state.poolQueries).toEqual([]);
    expect(harness.state.releases).toEqual([{ client: 1, error: undefined }]);
    const queries = clientQueries().map((query) => query.sql);
    expect(queries[0]).toBe("BEGIN READ ONLY");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries.some((sql) => sql.includes("FROM announcements"))).toBe(false);
    expect(harness.state.dead.has(1)).toBe(true);
  });

  it("releases with the rollback error when rollback fails and still throws the original query error", async () => {
    harness.state.failMarker = "FROM announcements";
    harness.state.failRollback = true;
    await expect(loadDashboard(full)).rejects.toThrow("metric query failed");
    expect(harness.state.releases).toHaveLength(1);
    expect(harness.state.releases[0]?.error).toMatchObject({ message: "rollback failed" });
    expect(clientQueries().some((query) => query.sql === "COMMIT")).toBe(false);
  });

  it("rolls back when commit fails and does not return partial dashboard data", async () => {
    harness.state.failCommit = true;
    await expect(loadDashboard(full)).rejects.toThrow("commit failed");
    const queries = clientQueries().map((query) => query.sql);
    expect(queries.filter((sql) => sql === "COMMIT")).toEqual(["COMMIT"]);
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(harness.state.releases).toEqual([{ client: 1, error: undefined }]);
  });

  it("keeps the global agent balance for every scope except agent and sub agent", async () => {
    const accounts = [
      user({ roleName: "sadmin" }),
      user({ roleName: "admin" }),
      user({ roleName: "owner" }),
      user({ roleName: "Agency", agencierId: 4 }),
      user({ roleName: "Agencier", agencierId: 4 }),
      user({ roleName: "Company", companierId: 8 }),
      user({ roleName: "Candidate", candidateId: 6 }),
      user({ roleName: "Employee", permissions: ["browse_candidates"] }),
      user({ roleName: "Employee" }),
      user({ roleName: "sadmin", status: "B" }),
      user({ roleName: "Candidate", candidateId: null }),
    ];
    for (const account of accounts) {
      harness.state.queries = [];
      harness.state.clients = 0;
      harness.state.releases = [];
      harness.state.dead = new Set();
      harness.state.maxInflight = 0;
      await loadDashboard(account);
      const balance = sqlMatching("AS balance");
      const count = sqlMatching("AS count");
      expect(balance?.sql).toBe(GLOBAL_BALANCE);
      expect(balance?.params).toEqual([]);
      expect(balance?.sql).not.toContain("candidates");
      expect(count?.sql).toBe(GLOBAL_COUNT);
      expect(count?.params).toEqual([]);
      expect(metricQueries().some((query) => query.sql.includes("AS teachers"))).toBe(account.roleName != null && ["sadmin", "admin", "owner"].includes(account.roleName) && account.status === "A");
    }
  });

  it("keeps agent and sub-agent balance queries on their own rows", async () => {
    await loadDashboard(user({ roleName: "Agent", agentId: 9 }));
    expect(sqlMatching("AS balance")?.sql).toBe(
      `SELECT COALESCE(balance, 0)::text AS balance FROM agents WHERE id = $1 AND deleted_at IS NULL`,
    );
    expect(sqlMatching("AS balance")?.params).toEqual([9]);
    expect(sqlMatching("AS count")?.sql).toBe(
      `SELECT COUNT(*)::int AS count FROM sub_agents WHERE agent_id = $1 AND deleted_at IS NULL`,
    );
    expect(sqlMatching("AS count")?.params).toEqual([9]);
    expect(metricQueries()).toHaveLength(7);

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    const sub = await loadDashboard(user({ roleName: "Sub Agent", subAgentId: 10 }));
    expect(sqlMatching("AS balance")?.sql).toBe(
      `SELECT COALESCE(balance, 0)::text AS balance FROM sub_agents WHERE id = $1 AND deleted_at IS NULL`,
    );
    expect(sqlMatching("AS balance")?.params).toEqual([10]);
    expect(sqlMatching("SELECT 1::int AS count")?.sql).toBe(`SELECT 1::int AS count`);
    expect(sqlMatching("SELECT 1::int AS count")?.params).toEqual([]);
    expect(sub.totalAgents).toBe(1);
    expect(sub.roster).toBeNull();
    expect(metricQueries()).toHaveLength(7);
  });

  it("returns zero when an agent or sub agent has no party scope and keeps the global balance for other scopes", async () => {
    await loadDashboard(user({ roleName: "Agent", agentId: 9 }));
    expect(sqlMatching("AS balance")?.sql).toBe(
      `SELECT COALESCE(balance, 0)::text AS balance FROM agents WHERE id = $1 AND deleted_at IS NULL`,
    );
    expect(sqlMatching("AS balance")?.params).toEqual([9]);
    expect(sqlMatching("AS balance")?.sql).not.toContain("SUM(balance)");

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    const missingAgent = await loadDashboard(user({ roleName: "Agent" }));
    expect(sqlMatching("AS balance")?.sql).toBe(ZERO_BALANCE);
    expect(sqlMatching("AS balance")?.params).toEqual([]);
    expect(missingAgent.agentBalance).toBe("0");
    expect(metricQueries().some((query) => query.sql.includes("SUM(balance)"))).toBe(false);
    expect(sqlMatching("AS count")?.sql).toBe(GLOBAL_COUNT);
    expect(sqlMatching("FROM payments")?.sql).toContain("WHERE FALSE");

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    await loadDashboard(user({ roleName: "Sub Agent", subAgentId: 10 }));
    expect(sqlMatching("AS balance")?.sql).toBe(
      `SELECT COALESCE(balance, 0)::text AS balance FROM sub_agents WHERE id = $1 AND deleted_at IS NULL`,
    );
    expect(sqlMatching("AS balance")?.params).toEqual([10]);
    expect(sqlMatching("AS balance")?.sql).not.toContain("SUM(balance)");

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    const subWithAgent = await loadDashboard(user({ roleName: "Sub Agent", agentId: 9 }));
    expect(sqlMatching("AS balance")?.sql).toBe(ZERO_BALANCE);
    expect(sqlMatching("AS balance")?.params).toEqual([]);
    expect(subWithAgent.agentBalance).toBe("0");
    expect(metricQueries().some((query) => query.sql.includes("SUM(balance)"))).toBe(false);
    expect(metricQueries().some((query) => query.sql.includes("FROM agents WHERE id"))).toBe(false);
    expect(sqlMatching("AS count")?.sql).toBe(GLOBAL_COUNT);

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    const missingSub = await loadDashboard(user({ roleName: "Sub Agent" }));
    expect(sqlMatching("AS balance")?.sql).toBe(ZERO_BALANCE);
    expect(sqlMatching("AS balance")?.params).toEqual([]);
    expect(missingSub.agentBalance).toBe("0");
    expect(metricQueries().some((query) => query.sql.includes("SUM(balance)"))).toBe(false);
    expect(sqlMatching("AS count")?.sql).toBe(GLOBAL_COUNT);

    const globals = [
      user({ roleName: "Agency", agencierId: 4 }),
      user({ roleName: "Company", companierId: 8 }),
      user({ roleName: "Employee", permissions: ["browse_candidates"] }),
    ];
    for (const account of globals) {
      harness.state.queries = [];
      harness.state.clients = 0;
      harness.state.releases = [];
      harness.state.dead = new Set();
      const data = await loadDashboard(account);
      expect(sqlMatching("AS balance")?.sql).toBe(GLOBAL_BALANCE);
      expect(sqlMatching("AS balance")?.params).toEqual([]);
      expect(sqlMatching("AS balance")?.sql).not.toContain("candidates");
      expect(sqlMatching("AS count")?.sql).toBe(GLOBAL_COUNT);
      expect(data.agentBalance).toBe("42.00");
    }
  });

  it("preserves candidate, payment, and reference predicates", async () => {
    const agent = user({ roleName: "Agent", agentId: 9 });
    await loadDashboard(agent);
    expectCandidatePredicate(agent);
    expect(sqlMatching("FROM payments")?.sql).toBe(
      `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE agent_id = $1 OR candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND agent_id = $1) GROUP BY type ORDER BY type`,
    );
    expect(sqlMatching("FROM payments")?.params).toEqual([9]);
    expect(sqlMatching("FROM class_schedules")?.sql).not.toContain("deleted_at");
    expect(sqlMatching("FROM exams")?.sql).not.toContain("candidate");
    expect(sqlMatching("FROM announcements")?.sql).not.toContain("candidate");
    expect(sqlMatching("FROM class_schedules")?.sql).toContain("LIMIT 8");
    expect(sqlMatching("FROM announcements")?.sql).toContain("LIMIT 8");

    const scopes: Array<{ account: AccessUser; money: string; params: unknown[] }> = [
      {
        account: user({ roleName: "sadmin" }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments GROUP BY type ORDER BY type`,
        params: [],
      },
      {
        account: user({ roleName: "Candidate", candidateId: 6 }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id = $1 GROUP BY type ORDER BY type`,
        params: [6],
      },
      {
        account: user({ roleName: "Sub Agent", subAgentId: 10 }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND "sub_agent_id" = $1) GROUP BY type ORDER BY type`,
        params: [10],
      },
      {
        account: user({ roleName: "Agency", agencierId: 4 }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND "agencier_id" = $1) GROUP BY type ORDER BY type`,
        params: [4],
      },
      {
        account: user({ roleName: "Company", companierId: 8 }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND "companier_id" = $1) GROUP BY type ORDER BY type`,
        params: [8],
      },
      {
        account: user({ roleName: "Employee", permissions: ["browse_candidates"] }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE FALSE GROUP BY type`,
        params: [],
      },
      {
        account: user({ roleName: "Employee" }),
        money: `SELECT COALESCE(type, '') AS type, COALESCE(SUM(amount), 0)::text AS total FROM payments WHERE FALSE GROUP BY type`,
        params: [],
      },
    ];
    for (const scope of scopes) {
      harness.state.queries = [];
      harness.state.clients = 0;
      harness.state.releases = [];
      harness.state.dead = new Set();
      await loadDashboard(scope.account);
      expectCandidatePredicate(scope.account);
      expect(sqlMatching("FROM payments")?.sql).toBe(scope.money);
      expect(sqlMatching("FROM payments")?.params).toEqual(scope.params);
    }
  });

  it("returns zero and null fallbacks when metric queries have no rows", async () => {
    harness.state.empty = true;
    const data = await loadDashboard(full);
    const emptyPipeline: DashboardData["pipeline"] = {
      registration: 0,
      profileCv: 0,
      grouped: 0,
      selection: 0,
      labour: 0,
      police: 0,
      medical: 0,
      visa: 0,
      manpower: 0,
      flight: 0,
      exams: 0,
    };
    expect(data.pipeline).toEqual(emptyPipeline);
    expect(data.money).toEqual([]);
    expect(data.agentBalance).toBe("0");
    expect(data.totalCandidates).toBe(0);
    expect(data.totalAgents).toBe(0);
    expect(data.selected).toEqual([]);
    expect(data.roster).toEqual({ students: 0, teachers: 0, agents: 0, employees: 0 });
    expect(data.classes).toEqual([]);
    expect(data.interviews).toEqual([]);
    expect(data.flights).toEqual([]);
    expect(data.announcements).toEqual([]);

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.releases = [];
    harness.state.dead = new Set();
    const agent = await loadDashboard(user({ roleName: "Agent", agentId: 9 }));
    expect(agent.roster).toBeNull();
    expect(agent.agentBalance).toBe("0");
    expect(agent.totalAgents).toBe(0);
  });

  it("keeps the four PDF pipeline counts and leaves the notification query on pool.query", async () => {
    const data = await loadDashboard(full);
    expect(data.pipeline.profileCv).toBe(2);
    expect(data.pipeline.labour).toBe(5);
    expect(data.pipeline.police).toBe(6);
    expect(data.pipeline.exams).toBe(12);
    const pdf = readFileSync(path.resolve("src/app/api/exports/pdf/route.ts"), "utf8");
    expect(pdf).toContain("data.pipeline.profileCv");
    expect(pdf).toContain("data.pipeline.labour");
    expect(pdf).toContain("data.pipeline.police");
    expect(pdf).toContain("data.pipeline.exams");
    expect(pdf).toContain("loadDashboard");
    const page = readFileSync(path.resolve("src/app/(workspace)/dashboard/page.tsx"), "utf8");
    expect(page).not.toContain('key: "profileCv"');
    expect(page).not.toContain('key: "labour"');
    expect(page).not.toContain('key: "police"');
    expect(page).not.toContain('key: "exams"');

    harness.state.queries = [];
    harness.state.clients = 0;
    harness.state.poolQueries = [];
    const header = await loadShellHeader(15);
    expect(header).toEqual({ unread: 4 });
    expect(harness.state.clients).toBe(0);
    expect(harness.state.poolQueries).toHaveLength(1);
    expect(harness.state.poolQueries[0]?.sql).toContain("FROM notifications");
    expect(harness.state.poolQueries[0]?.params).toEqual([15]);
  });

  it("does not leave an independent pool.query on the metric path", () => {
    const source = readFileSync(path.resolve("src/server/dashboard.ts"), "utf8");
    const withoutShell = source.replace(/export async function loadShellHeader[\s\S]*?\n\}/, "");
    expect(withoutShell).not.toContain("pool.query");
    expect(withoutShell).not.toContain("Promise.all");
    expect(withoutShell).not.toContain("new Pool");
    expect(withoutShell).not.toContain("new PrismaClient");
    expect(withoutShell).not.toContain("SERIALIZABLE");
    expect(withoutShell).not.toContain("REPEATABLE");
    expect(withoutShell).toContain("pool.connect(");
    expect(withoutShell).toContain('client.query("BEGIN READ ONLY")');
    expect(withoutShell).toContain('client.query("COMMIT")');
    expect(withoutShell).toContain('client.query("ROLLBACK")');
    expect(source).toContain(`scope.kind === "subAgent" || scope.kind === "agencier" || scope.kind === "companier"`);
    expect(source).not.toContain(`scope.kind !== "none"`);
    expect(source).toContain("WITH scoped AS MATERIALIZED");
    expect(source).toContain("DISTINCT ON (c.id)");
    expect(source).not.toContain("COUNT(DISTINCT");
    expectSevenTableUnion(source);
    const bannerAt = source.indexOf("DISTINCT ON (c.id)");
    const flightAt = source.indexOf("FROM flight_schedules f");
    expect(bannerAt).toBeGreaterThan(-1);
    expect(flightAt).toBeGreaterThan(bannerAt);
    expect(source.slice(bannerAt, flightAt)).not.toMatch(/LIMIT/i);
    expect(source.slice(flightAt, flightAt + 400)).toContain("LIMIT 8");
  });

  it("returns every banner when more are eligible than a page limit", async () => {
    harness.state.bannerCount = 12;
    const data = await loadDashboard(full);
    expect(data.selected).toHaveLength(12);
    expect(data.selected.map((banner) => banner.id)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(data.pipeline.selection).toBe(4);
    expect(data.pipeline.selection).not.toBe(data.selected.length);
    const scoped = sqlMatching("WITH scoped AS MATERIALIZED");
    const bannerAt = scoped?.sql.indexOf("DISTINCT ON (c.id)") ?? -1;
    const flightAt = scoped?.sql.indexOf("FROM flight_schedules f") ?? -1;
    expect(scoped?.sql.slice(bannerAt, flightAt)).not.toMatch(/LIMIT/i);
  });

  it("returns no candidate rows when the scoped scan matches nothing and keeps the other metrics", async () => {
    harness.state.noCandidates = true;
    const data = await loadDashboard(full);
    expect(data.pipeline).toEqual({
      registration: 0,
      profileCv: 0,
      grouped: 0,
      selection: 0,
      labour: 0,
      police: 0,
      medical: 0,
      visa: 0,
      manpower: 0,
      flight: 0,
      exams: 0,
    });
    expect(data.totalCandidates).toBe(0);
    expect(data.selected).toEqual([]);
    expect(data.flights).toEqual([]);
    expect(data.money).toEqual([
      { type: "fee", total: "10.50" },
      { type: "", total: "1" },
    ]);
    expect(data.agentBalance).toBe("42.00");
    expect(data.classes).toEqual([{ title: "Math", when: "Sunday 09:00", detail: "" }]);
    expect(data.roster).toEqual({ students: 0, teachers: 3, agents: 6, employees: 4 });
    expect(sqlMatching("AS balance")?.sql).toBe(GLOBAL_BALANCE);
    expect(sqlMatching("AS balance")?.sql).not.toContain("candidates");
  });
});
