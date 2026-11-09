import { describe, expect, it } from "vitest";
import { canMutateTable, type AccessUser } from "@/lib/auth/permissions";
import { visibilitySql, type ScopedResource } from "@/lib/auth/row-scope";

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

const reference = (table: string): ScopedResource => ({ table, scope: { mode: "reference" } });

const exams = reference("exams");
const positions = reference("positions");
const districts = reference("districts");
const documentTypes = reference("document_types");
const employees = reference("employees");
const employers = reference("employers");
const teachers = reference("teachers");
const roles = reference("roles");
const users = reference("users");
const licenses = reference("licenses");
const auditLogs = reference("audit_logs");
const jobs = reference("jobs");
const announcements = reference("announcements");
const pages = reference("pages");
const reports = reference("reports");

describe("reference module visibility", () => {
  it("keeps sadmin and owner unrestricted on sensitive reference modules", () => {
    for (const roleName of ["sadmin", "owner"] as const) {
      const admin = user({ roleName, permissions: [] });
      expect(visibilitySql(jobs, admin, [])).toBe("TRUE");
      expect(visibilitySql(users, admin, [])).toBe("TRUE");
      expect(visibilitySql(employees, admin, [])).toBe("TRUE");
      expect(visibilitySql(auditLogs, admin, [])).toBe("TRUE");
      expect(visibilitySql(licenses, admin, [])).toBe("TRUE");
    }
  });

  it("keeps shared recruitment lookups readable for office and party users", () => {
    const employee = user();
    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_candidates"] });
    for (const resource of [exams, positions, districts, documentTypes]) {
      expect(visibilitySql(resource, employee, [])).toBe("TRUE");
      expect(visibilitySql(resource, agent, [])).toBe("TRUE");
    }
    expect(visibilitySql(reference("class_groups"), agent, [])).toBe("TRUE");
    expect(visibilitySql(reference("live_status"), agent, [])).toBe("TRUE");
    expect(visibilitySql(reference("currencies"), agent, [])).toBe("TRUE");
    expect(visibilitySql(reference("ticket_companies"), agent, [])).toBe("TRUE");
  });

  it("does not open staff directories or the job queue from office scope alone", () => {
    const employee = user({ permissions: ["browse_candidates", "browse_jobs", "browse_employees"] });
    expect(visibilitySql(employees, employee, [])).toBe("TRUE");
    expect(visibilitySql(jobs, employee, [])).toBe("FALSE");
    expect(visibilitySql(employers, user(), [])).toBe("FALSE");
    expect(visibilitySql(teachers, user(), [])).toBe("FALSE");
    expect(visibilitySql(roles, user(), [])).toBe("FALSE");
    expect(visibilitySql(users, user(), [])).toBe(`"id" = $1`);
    const granted = user({ permissions: ["browse_candidates", "browse_users", "browse_roles", "browse_audit_logs", "browse_licenses"] });
    expect(visibilitySql(users, granted, [])).toBe("TRUE");
    expect(visibilitySql(roles, granted, [])).toBe("TRUE");
    expect(visibilitySql(auditLogs, granted, [])).toBe("TRUE");
    expect(visibilitySql(licenses, granted, [])).toBe("TRUE");
  });

  it("keeps a party browse grant inside ownership boundaries", () => {
    const agent = user({
      roleName: "Agent",
      agentId: 4,
      permissions: ["browse_users", "browse_employees", "browse_employers", "browse_teachers", "browse_roles", "browse_audit_logs", "browse_jobs", "browse_licenses", "browse_reports"],
    });
    const userParams: unknown[] = [];
    const auditParams: unknown[] = [];
    expect(visibilitySql(employees, agent, [])).toBe("FALSE");
    expect(visibilitySql(employers, agent, [])).toBe("FALSE");
    expect(visibilitySql(teachers, agent, [])).toBe("FALSE");
    expect(visibilitySql(roles, agent, [])).toBe("FALSE");
    expect(visibilitySql(jobs, agent, [])).toBe("FALSE");
    expect(visibilitySql(licenses, agent, [])).toBe("FALSE");
    expect(visibilitySql(users, agent, userParams)).toBe(`("agent_id" = $1 OR "id" = $2)`);
    expect(userParams).toEqual([4, 7]);
    expect(visibilitySql(auditLogs, agent, auditParams)).toBe(`"user_id" = $1`);
    expect(auditParams).toEqual([7]);
    expect(visibilitySql(reports, agent, [])).toBe("TRUE");
    expect(visibilitySql(positions, agent, [])).toBe("TRUE");
  });

  it("scopes each party role to its own user and license rows", () => {
    const subParams: unknown[] = ["kept"];
    const sub = user({ roleName: "Sub Agent", subAgentId: 3, permissions: ["browse_users"] });
    expect(visibilitySql(users, sub, subParams)).toBe(`("sub_agent_id" = $2 OR "id" = $3)`);
    expect(subParams).toEqual(["kept", 3, 7]);

    const agencyParams: unknown[] = [];
    const agency = user({ roleName: "Agency", agencierId: 8, permissions: ["browse_users"] });
    expect(visibilitySql(users, agency, agencyParams)).toBe(`("agencier_id" = $1 OR "id" = $2)`);
    expect(agencyParams).toEqual([8, 7]);

    const candidateParams: unknown[] = [];
    const candidate = user({ roleName: "Candidate", candidateId: 9, permissions: [] });
    expect(visibilitySql(users, candidate, candidateParams)).toBe(`"id" = $1`);
    expect(candidateParams).toEqual([7]);

    const companyParams: unknown[] = [];
    const company = user({ roleName: "Company", companierId: 6, permissions: ["browse_licenses", "browse_users"] });
    expect(visibilitySql(licenses, company, companyParams)).toBe(`"companier_id" = $1`);
    expect(companyParams).toEqual([6]);
    const companyUsers: unknown[] = [];
    expect(visibilitySql(users, company, companyUsers)).toBe(`("companier_id" = $1 OR "id" = $2)`);
    expect(companyUsers).toEqual([6, 7]);
  });

  it("requires the module grant before global content rows are visible", () => {
    const employee = user();
    expect(visibilitySql(announcements, employee, [])).toBe("FALSE");
    expect(visibilitySql(pages, employee, [])).toBe("FALSE");
    const granted = user({ permissions: ["browse_candidates", "browse_announcements", "browse_pages"] });
    expect(visibilitySql(announcements, granted, [])).toBe("TRUE");
    expect(visibilitySql(pages, granted, [])).toBe("TRUE");
    const agent = user({ roleName: "Agent", agentId: 4, permissions: ["browse_pages"] });
    expect(visibilitySql(pages, agent, [])).toBe("TRUE");
    expect(visibilitySql(announcements, agent, [])).toBe("FALSE");
  });

  it("does not turn a reference read grant into write access", () => {
    const reader = user({ permissions: ["browse_candidates", "browse_employees", "browse_users", "browse_licenses"] });
    expect(visibilitySql(employees, reader, [])).toBe("TRUE");
    expect(canMutateTable(reader, "employees", "add")).toBe(false);
    expect(canMutateTable(reader, "employees", "edit")).toBe(false);
    expect(canMutateTable(reader, "employees", "delete")).toBe(false);
    expect(canMutateTable(reader, "users", "edit")).toBe(false);
    expect(canMutateTable(reader, "licenses", "delete")).toBe(false);
    const editor = user({ permissions: ["browse_employees", "edit_employees", "browse_candidates"] });
    expect(canMutateTable(editor, "employees", "edit")).toBe(true);
    expect(canMutateTable(editor, "employees", "add")).toBe(false);
  });

  it("hides reference rows from an inactive user", () => {
    const inactive = user({ status: "I", permissions: ["browse_employees", "browse_users", "browse_positions"] });
    expect(visibilitySql(positions, inactive, [])).toBe("FALSE");
    expect(visibilitySql(employees, inactive, [])).toBe("FALSE");
    expect(visibilitySql(users, inactive, [])).toBe("FALSE");
    expect(visibilitySql(jobs, user({ roleName: "owner", status: "I", permissions: [] }), [])).toBe("FALSE");
  });
});
