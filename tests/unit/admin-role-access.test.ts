import { describe, expect, it } from "vitest";
import { canBrowseTable, canCandidateAction, canMutateTable, hasFullAccess, hasGrant, hasPermission, recordScope, type AccessUser } from "@/lib/auth/permissions";
import { storedFileBypass } from "@/lib/auth/public-candidate";
import { candidateFilterSql, visibilitySql, type ScopedResource } from "@/lib/auth/row-scope";
import { walletLedgerScope, walletPaymentWhere } from "@/lib/auth/wallet-scope";

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: [],
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

const employees: ScopedResource = {
  table: "employees",
  scope: { mode: "reference" },
};

describe("full-access roles", () => {
  it.each(["sadmin", "owner", "admin"] as const)("gives %s unrestricted data access without a stored grant", (roleName) => {
    const account = user({ roleName, permissions: [] });
    expect(hasFullAccess(account)).toBe(true);
    expect(recordScope(account)).toEqual({ kind: "all" });
    expect(hasPermission(account, "browse_candidates")).toBe(true);
    expect(hasPermission(account, "read_candidates")).toBe(true);
    expect(hasPermission(account, "edit_candidates")).toBe(true);
    expect(hasPermission(account, "add_candidates")).toBe(true);
    expect(hasPermission(account, "delete_users")).toBe(true);
    expect(canBrowseTable(account, "employees")).toBe(true);
    expect(canMutateTable(account, "employees", "add")).toBe(true);
    expect(canMutateTable(account, "employees", "edit")).toBe(true);
    expect(canMutateTable(account, "employees", "delete")).toBe(true);
    expect(canMutateTable(account, "candidates", "add")).toBe(true);
    expect(canMutateTable(account, "candidates", "edit")).toBe(true);
    expect(canMutateTable(account, "candidates", "delete")).toBe(false);
    expect(canCandidateAction(account, "approve")).toBe(true);
    expect(canCandidateAction(account, "delete")).toBe(false);
    expect(visibilitySql(candidates, account, [])).toBe("TRUE");
    expect(visibilitySql(employees, account, [])).toBe("TRUE");
    expect(candidateFilterSql(account, [])).toBe(`"deleted_at" IS NULL`);
    expect(storedFileBypass(account, 99)).toBe(true);
    expect(walletPaymentWhere(walletLedgerScope(account), [])).toBe("p.id IS NOT NULL");
  });

  it("keeps menu and module grants on the stored permission for every full-access role", () => {
    for (const roleName of ["sadmin", "owner", "admin"] as const) {
      const account = user({ roleName, permissions: ["browse_users"] });
      expect(hasGrant(account, "browse_users")).toBe(true);
      expect(hasGrant(account, "browse_settings")).toBe(false);
      expect(hasGrant(account, "browse_menus")).toBe(false);
      expect(hasGrant(account, "browse_roles")).toBe(false);
      expect(hasGrant(account, "edit_users")).toBe(false);
    }
  });

  it("still denies an inactive full-access role", () => {
    const account = user({ roleName: "admin", status: "I", permissions: ["browse_candidates", "edit_candidates"] });
    expect(hasPermission(account, "browse_candidates")).toBe(false);
    expect(canBrowseTable(account, "candidates")).toBe(false);
    expect(canMutateTable(account, "candidates", "edit")).toBe(false);
    expect(hasGrant(account, "browse_candidates")).toBe(false);
    expect(recordScope(account)).toEqual({ kind: "none" });
    expect(visibilitySql(candidates, account, [])).toBe("FALSE");
    expect(walletLedgerScope(account).kind).toBe("none");
    expect(storedFileBypass(account, account.id)).toBe(false);
  });

  it("keeps a linked party id ahead of the global wallet for sadmin, owner, and admin", () => {
    const linked = user({ roleName: "admin", agentId: 4, permissions: [] });
    const params: unknown[] = [];
    expect(recordScope(linked).kind).toBe("all");
    expect(walletPaymentWhere(walletLedgerScope(linked), params)).toBe("p.agent_id = $1");
    expect(params).toEqual([4]);
    expect(walletLedgerScope(user({ roleName: "sadmin", subAgentId: 3, permissions: [] })).kind).toBe("subAgent");
    expect(walletLedgerScope(user({ roleName: "owner", agentId: 4, permissions: [] })).kind).toBe("agent");
  });
});

describe("staff and party restrictions", () => {
  it("keeps Employee and Teacher inside office scope", () => {
    const employee = user({ roleName: "Employee", permissions: ["browse_candidates", "browse_employees"] });
    const teacher = user({ roleName: "Teacher", permissions: ["browse_candidates"] });
    expect(hasFullAccess(employee)).toBe(false);
    expect(hasFullAccess(teacher)).toBe(false);
    expect(recordScope(employee).kind).toBe("office");
    expect(recordScope(teacher).kind).toBe("office");
    expect(visibilitySql(candidates, employee, [])).toBe("FALSE");
    expect(visibilitySql(candidates, teacher, [])).toBe("FALSE");
    expect(candidateFilterSql(employee, [])).toBe("FALSE");
    expect(visibilitySql(employees, employee, [])).toBe("TRUE");
    expect(visibilitySql(employees, teacher, [])).toBe("FALSE");
    expect(walletLedgerScope(employee).kind).toBe("none");
    expect(walletLedgerScope(teacher).kind).toBe("none");
    expect(storedFileBypass(employee, 99)).toBe(false);
  });

  it("does not treat a browse grant as a mutation grant", () => {
    const reader = user({
      roleName: "Employee",
      permissions: ["browse_candidates", "browse_employees", "browse_users", "read_employees"],
    });
    const teacher = user({ roleName: "Teacher", permissions: ["browse_candidates", "browse_teachers"] });
    expect(canBrowseTable(reader, "employees")).toBe(true);
    expect(canBrowseTable(reader, "users")).toBe(true);
    expect(canMutateTable(reader, "employees", "add")).toBe(false);
    expect(canMutateTable(reader, "employees", "edit")).toBe(false);
    expect(canMutateTable(reader, "employees", "delete")).toBe(false);
    expect(canMutateTable(reader, "users", "edit")).toBe(false);
    expect(canMutateTable(reader, "candidates", "delete")).toBe(false);
    expect(canBrowseTable(teacher, "teachers")).toBe(true);
    expect(canMutateTable(teacher, "teachers", "edit")).toBe(false);
    expect(hasPermission(reader, "edit_employees")).toBe(false);
    expect(hasGrant(reader, "browse_employees")).toBe(true);
    expect(hasGrant(reader, "edit_employees")).toBe(false);
  });

  it("keeps party roles inside their ownership id", () => {
    expect(hasFullAccess(user({ roleName: "Agent", agentId: 4, permissions: ["browse_candidates", "edit_candidates"] }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Sub Agent", subAgentId: 3 }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Agency", agencierId: 8 }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Agencier", agencierId: 8 }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Company", companierId: 6 }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Candidate", candidateId: 9 }))).toBe(false);

    expect(recordScope(user({ roleName: "Agent", agentId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Sub Agent", subAgentId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Agency", agencierId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Company", companierId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Candidate", candidateId: null, permissions: ["browse_candidates"] })).kind).toBe("none");

    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_candidates", "edit_candidates"] });
    const sub = user({ roleName: "Sub Agent", subAgentId: 3, permissions: ["browse_candidates"] });
    const agency = user({ roleName: "Agency", agencierId: 8, permissions: ["browse_candidates", "delete_candidates"] });
    const company = user({ roleName: "Company", companierId: 6, permissions: ["browse_candidates"] });
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: ["browse_candidates", "edit_candidates"] });

    expect(recordScope(agent)).toEqual({ kind: "agent", agentId: 4 });
    expect(recordScope(sub)).toEqual({ kind: "subAgent", subAgentId: 3 });
    expect(recordScope(agency)).toEqual({ kind: "agencier", agencierId: 8 });
    expect(recordScope(user({ roleName: "Agencier", agencierId: 8 }))).toEqual({ kind: "agencier", agencierId: 8 });
    expect(recordScope(company)).toEqual({ kind: "companier", companierId: 6 });
    expect(recordScope(user({ roleName: "Companier", companierId: 6 }))).toEqual({ kind: "companier", companierId: 6 });
    expect(recordScope(user({ roleName: "Companier", companierId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
    expect(recordScope(candidate)).toEqual({ kind: "candidate", candidateId: 9 });
    expect(recordScope(user({ roleName: "Employee", candidateId: 9, permissions: ["browse_candidates"] })).kind).toBe("office");
    expect(candidateFilterSql(user({ roleName: "Employee", candidateId: 9, permissions: ["browse_candidates", "edit_candidates"] }), [])).toBe("FALSE");
    expect(recordScope(user({ roleName: "User", candidateId: 9, permissions: ["browse_candidates"] })).kind).toBe("office");
    expect(candidateFilterSql(user({ roleName: "User", candidateId: 9, permissions: ["browse_candidates"] }), [])).toBe("FALSE");
    expect(canMutateTable(user({ roleName: "Agent", agentId: 4, permissions: ["add_candidates", "edit_candidates", "delete_candidates"] }), "candidates", "add")).toBe(false);

    const agentParams: unknown[] = [];
    expect(visibilitySql(candidates, agent, agentParams)).toBe(`"agent_id" = $1`);
    expect(agentParams).toEqual([4]);
    expect(canBrowseTable(agent, "candidates")).toBe(true);
    expect(canMutateTable(agent, "candidates", "edit")).toBe(false);
    expect(canMutateTable(agent, "candidates", "add")).toBe(false);
    expect(canMutateTable(agent, "candidates", "delete")).toBe(false);
    expect(canCandidateAction(agent, "approve")).toBe(false);
    expect(canMutateTable(agency, "candidates", "delete")).toBe(false);
    expect(canMutateTable(agency, "candidates", "edit")).toBe(false);
    expect(canMutateTable(candidate, "candidates", "edit")).toBe(false);
    expect(canMutateTable(candidate, "employees", "edit")).toBe(false);

    const agentWallet: unknown[] = [];
    expect(walletPaymentWhere(walletLedgerScope(agent), agentWallet)).toBe("p.agent_id = $1");
    expect(agentWallet).toEqual([4]);
    expect(walletLedgerScope(user({ roleName: "Agent", agentId: null, permissions: ["browse_candidates"] })).kind).toBe("none");
  });
});
