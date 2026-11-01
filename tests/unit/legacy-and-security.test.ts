import { hash } from "bcryptjs";
import { describe, expect, it } from "vitest";
import { hasFullAccess, hasPermission, recordScope, type AccessUser } from "@/lib/auth/permissions";
import { normalizeBcryptHash, verifyPassword } from "@/lib/auth/password";
import { sanitizeSpreadsheetCell } from "@/lib/excel";
import { parseDump, SqlDumpScanner } from "@/lib/legacy/scan-dump";
import { addDecimal, decimalEquals } from "@/lib/money";

const user = (overrides: Partial<AccessUser> = {}): AccessUser => ({
  id: 1,
  name: "Shamim",
  roleName: "Agent",
  permissions: ["browse_candidates"],
  agentId: 4,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
  ...overrides,
});

describe("legacy dump parser", () => {
  it("parses escaped strings, nulls, and commas", async () => {
    const sql = `
INSERT INTO \`roles\` (\`id\`, \`name\`, \`display_name\`) VALUES
(1, 'O\\'Brien', 'A, B'),
(2, 'line\\nbreak', NULL);
`;
    const [statement] = await parseDump(sql);
    expect(statement.table).toBe("roles");
    expect(statement.columns).toEqual(["id", "name", "display_name"]);
    expect(statement.rows).toEqual([
      ["1", "O'Brien", "A, B"],
      ["2", "line\nbreak", null],
    ]);
  });

  it("keeps strings that span chunk boundaries", async () => {
    const sql = "INSERT INTO `notes` (`id`, `body`) VALUES\n(1, 'hello, world');";
    const rows: Array<(string | null)[]> = [];
    const scanner = new SqlDumpScanner({
      onRow: (_table, _columns, row) => {
        rows.push(row);
      },
    });
    await scanner.push(sql.slice(0, 28));
    await scanner.push(sql.slice(28));
    await scanner.finish();
    expect(rows).toEqual([["1", "hello, world"]]);
  });
});

describe("decimal reconciliation", () => {
  it("adds decimal strings without binary floating point", () => {
    expect(addDecimal("0.10", "0.20")).toBe("0.3");
    expect(addDecimal("700000", "1.5")).toBe("700001.5");
    expect(decimalEquals("10.00", "10")).toBe(true);
  });
});

describe("spreadsheet safety", () => {
  it("neutralizes formula prefixes", () => {
    expect(sanitizeSpreadsheetCell("=cmd()")).toBe("'=cmd()");
    expect(sanitizeSpreadsheetCell("+8801")).toBe("'+8801");
    expect(sanitizeSpreadsheetCell("plain")).toBe("plain");
    expect(sanitizeSpreadsheetCell(12)).toBe(12);
  });
});

describe("passwords and permissions", () => {
  it("verifies a Laravel $2y$ hash without rewriting it", async () => {
    const hashed = await hash("correct-horse", 4);
    const laravel = hashed.replace(/^\$2[ab]\$/, "$2y$");
    expect(normalizeBcryptHash(laravel).startsWith("$2a$")).toBe(true);
    expect(await verifyPassword("correct-horse", laravel)).toBe(true);
    expect(await verifyPassword("wrong", laravel)).toBe(false);
  });

  it("grants full access only to verified administrative roles", () => {
    expect(hasFullAccess(user({ roleName: "owner" }))).toBe(true);
    expect(hasFullAccess(user({ roleName: "admin" }))).toBe(false);
    expect(hasFullAccess(user({ roleName: "Agent" }))).toBe(false);
    expect(hasPermission(user(), "browse_candidates")).toBe(true);
    expect(hasPermission(user(), "delete_candidates")).toBe(false);
    expect(hasPermission(user({ status: "I" }), "browse_candidates")).toBe(false);
    expect(hasPermission(user({ roleName: "sadmin", permissions: [] }), "delete_users")).toBe(true);
  });

  it("scopes records to the signed-in party", () => {
    expect(recordScope(user())).toEqual({ kind: "agent", agentId: 4 });
    expect(recordScope(user({ roleName: "Candidate", candidateId: 9, permissions: ["browse_candidates"] }))).toEqual({
      kind: "candidate",
      candidateId: 9,
    });
    expect(recordScope(user({ roleName: "owner", permissions: [] })).kind).toBe("all");
    expect(recordScope(user({ roleName: "admin", permissions: [] })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Employee", agentId: null, permissions: ["browse_candidates"] })).kind).toBe("all");
    expect(recordScope(user({ status: "I" })).kind).toBe("none");
    expect(recordScope(user({ roleName: "Sub Agent", subAgentId: 3, agentId: null })).kind).toBe("subAgent");
  });
});
