import { describe, expect, it } from "vitest";
import { recordScope, type AccessUser } from "@/lib/auth/permissions";
import { isSafeMediaPath, publicCandidateFilter, storedFileBypass } from "@/lib/auth/public-candidate";
import { candidateFilterSql, visibilitySql, type ScopedResource } from "@/lib/auth/row-scope";
import { walletBalanceSql, walletLedgerScope, walletPaymentWhere } from "@/lib/auth/wallet-scope";

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: ["browse_candidates"],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
  ...overrides,
});

const candidates: ScopedResource = {
  table: "candidates",
  scope: { mode: "column", candidate: "id", agent: "agent_id", subAgent: "sub_agent_id", agencier: "agencier_id", companier: "companier_id" },
};

const medicals: ScopedResource = {
  table: "medicals",
  scope: { mode: "candidate-child", column: "candidate_id" },
};

const exams: ScopedResource = {
  table: "exams",
  scope: { mode: "reference" },
};

describe("candidate visibility", () => {
  it("keeps unrestricted candidate rows for sadmin and owner only", () => {
    expect(recordScope(user({ roleName: "sadmin", permissions: [] })).kind).toBe("all");
    expect(recordScope(user({ roleName: "owner", permissions: [] })).kind).toBe("all");
    expect(visibilitySql(candidates, user({ roleName: "owner", permissions: [] }), [])).toBe("TRUE");
  });

  it("does not treat browse_candidates as access to every candidate", () => {
    const employee = user();
    const teacher = user({ roleName: "Teacher" });
    expect(recordScope(employee).kind).toBe("office");
    expect(recordScope(teacher).kind).toBe("office");
    expect(visibilitySql(candidates, employee, [])).toBe("FALSE");
    expect(visibilitySql(medicals, teacher, [])).toBe("FALSE");
    expect(candidateFilterSql(employee, [])).toBe("FALSE");
    expect(visibilitySql(exams, employee, [])).toBe("TRUE");
  });

  it("denies a party role whose ownership id is missing", () => {
    expect(recordScope(user({ roleName: "Agent", agentId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Agency", agencierId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Company", companierId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Candidate", candidateId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(candidateFilterSql(user({ roleName: "Agent", agentId: null }), [])).toBe("FALSE");
  });

  it("keeps an agent, agency, and candidate inside their own records", () => {
    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_candidates"] });
    const agency = user({ roleName: "Agency", agencierId: 8, permissions: ["browse_candidates"] });
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: ["browse_candidates"] });
    const agentParams: unknown[] = [];
    const agencyParams: unknown[] = [];
    const childParams: unknown[] = [];
    expect(visibilitySql(candidates, agent, agentParams)).toBe(`"agent_id" = $1`);
    expect(agentParams).toEqual([4]);
    expect(visibilitySql(candidates, agency, agencyParams)).toBe(`"agencier_id" = $1`);
    expect(agencyParams).toEqual([8]);
    expect(visibilitySql(medicals, candidate, childParams)).toBe(`"candidate_id" = $1`);
    expect(childParams).toEqual([9]);
  });
});

describe("wallet ledger", () => {
  it("gives an agent and a sub-agent only their own payments", () => {
    const agent = user({ roleName: "Agent", agentId: 4, permissions: [] });
    const sub = user({ roleName: "Sub Agent", subAgentId: 3, permissions: [] });
    const agentParams: unknown[] = [];
    const subParams: unknown[] = [];
    expect(walletPaymentWhere(walletLedgerScope(agent), agentParams)).toBe("p.agent_id = $1");
    expect(agentParams).toEqual([4]);
    expect(walletPaymentWhere(walletLedgerScope(sub), subParams)).toBe("p.sub_agent_id = $1");
    expect(subParams).toEqual([3]);
    expect(walletBalanceSql(walletLedgerScope(agent)).sql).toContain("FROM agents");
  });

  it("does not fall back to every payment", () => {
    const employee = user();
    const where = walletPaymentWhere(walletLedgerScope(employee), []);
    expect(where).toBe("FALSE");
    expect(where).not.toBe("TRUE");
    expect(walletBalanceSql(walletLedgerScope(employee)).sql).toBe("SELECT 0::text AS balance");
    const ownerWhere = walletPaymentWhere(walletLedgerScope(user({ roleName: "owner", permissions: [] })), []);
    expect(ownerWhere).toBe("p.id IS NOT NULL");
  });

  it("limits agency and company wallets to their candidates", () => {
    const agencyParams: unknown[] = [];
    const companyParams: unknown[] = [];
    expect(walletPaymentWhere(walletLedgerScope(user({ roleName: "Agency", agencierId: 8, permissions: [] })), agencyParams)).toContain("agencier_id = $1");
    expect(agencyParams).toEqual([8]);
    expect(walletPaymentWhere(walletLedgerScope(user({ roleName: "Company", companierId: 6, permissions: [] })), companyParams)).toContain("companier_id = $1");
    expect(companyParams).toEqual([6]);
  });
});

describe("private files and the public directory", () => {
  it("does not authorize a stored file from a session alone", () => {
    const employee = user();
    expect(storedFileBypass(employee, 99)).toBe(false);
    expect(storedFileBypass(employee, employee.id)).toBe(true);
    expect(storedFileBypass(user({ roleName: "sadmin", permissions: [] }), 99)).toBe(true);
    expect(storedFileBypass(user({ roleName: "owner", permissions: [] }), null)).toBe(true);
    expect(storedFileBypass(user({ status: "I" }), 7)).toBe(false);
  });

  it("publishes only banner candidates and safe public media paths", () => {
    const filter = publicCandidateFilter("c");
    expect(filter).toContain("selected_candidates");
    expect(filter).toContain("c.deleted_at IS NULL");
    expect(isSafeMediaPath("posts/news/cover.jpg")).toBe(true);
    expect(isSafeMediaPath("users/default.png")).toBe(true);
    expect(isSafeMediaPath("candidates/May2025/portrait.jpg")).toBe(true);
    expect(isSafeMediaPath("../secrets.pdf")).toBe(false);
    expect(isSafeMediaPath("candidates")).toBe(false);
    expect(isSafeMediaPath("passport.pdf")).toBe(false);
    expect(() => publicCandidateFilter("c;drop")).toThrow();
  });
});
