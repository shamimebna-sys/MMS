import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  pool: { query },
}));

vi.mock("@/server/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(async (value: string) => `hashed:${value}`),
}));

import { hashPassword } from "@/lib/auth/password";
import { loadBreadForm, saveBreadRecord } from "@/server/bread-form";

const hash = vi.mocked(hashPassword);

const admin: AccessUser = {
  id: 1,
  name: "Admin",
  roleName: "admin",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const agent: AccessUser = {
  id: 2,
  name: "Agent",
  roleName: "Agent",
  permissions: ["add_candidates"],
  agentId: 7,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const SECRET = "Candidate-edit-secret-1";
const FORGED = "forged-password-hash";
const ACCOUNT_PASSWORD = "Replacement-password-1";
const INITIAL_PASSWORD = "Initial-login-secret-1";

type QueryCall = { sql: string; params: unknown[] };

const calls: QueryCall[] = [];

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function writes(): QueryCall[] {
  return calls.filter((call) => /^(update|insert)\b/i.test(compact(call.sql)));
}

beforeEach(() => {
  calls.length = 0;
  hash.mockClear();
  query.mockReset();
  query.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const text = String(sql);
    const bound = params ?? [];
    calls.push({ sql: text, params: bound });
    const statement = compact(text);
    if (statement.includes("FROM data_types")) {
      const slug = String(bound[0] ?? "");
      if (slug === "users" || slug === "user") {
        return { rows: [{ id: 2, slug: "users", name: "users", display_name_singular: "User" }], rowCount: 1 };
      }
      return { rows: [{ id: 1, slug: "candidates", name: "candidates", display_name_singular: "Candidate" }], rowCount: 1 };
    }
    if (statement.includes("FROM data_rows")) {
      if (bound[0] === 2) {
        return {
          rows: [
            { field: "name", type: "text", display_name: "Name", required: 1, details: null },
            { field: "email", type: "text", display_name: "Email", required: 1, details: null },
            { field: "password", type: "password", display_name: "Password", required: 0, details: null },
          ],
          rowCount: 3,
        };
      }
      return {
        rows: [
          { field: "name", type: "text", display_name: "Name", required: 1, details: null },
          { field: "email", type: "text", display_name: "Email", required: 0, details: null },
          { field: "mobile", type: "text", display_name: "Mobile", required: 0, details: null },
          { field: "password", type: "password", display_name: "Password", required: 0, details: null },
          { field: "password_hash", type: "text", display_name: "Password hash", required: 0, details: null },
        ],
        rowCount: 5,
      };
    }
    if (statement.includes("information_schema.columns")) {
      const requested = Array.isArray(bound[0]) ? bound[0].map(String) : [String(bound[0] ?? "")];
      const rows = requested.flatMap((table) => {
        const columns =
          table === "users"
            ? [
                ["id", "integer"],
                ["name", "character varying"],
                ["email", "character varying"],
                ["password", "text"],
                ["updated_at", "timestamp with time zone"],
                ["created_at", "timestamp with time zone"],
              ]
            : [
                ["id", "integer"],
                ["name", "character varying"],
                ["email", "character varying"],
                ["mobile", "character varying"],
                ["password", "text"],
                ["password_hash", "text"],
                ["agent_id", "integer"],
                ["updated_at", "timestamp with time zone"],
                ["created_at", "timestamp with time zone"],
              ];
        return columns.map(([column_name, data_type]) => ({ table_name: table, column_name, data_type }));
      });
      return { rows, rowCount: rows.length };
    }
    if (statement.includes("FROM roles")) return { rows: [{ id: 5 }], rowCount: 1 };
    if (/^(update|insert)\b/i.test(statement)) {
      return { rows: statement.includes("RETURNING") ? [{ id: 41 }] : [], rowCount: 1 };
    }
    if (statement.includes('FROM "candidates"')) {
      return {
        rows: [
          {
            id: "9",
            name: "Amina",
            email: "amina@example.com",
            mobile: "01711111111",
            password: "stored-hash",
            password_hash: "stored-hash",
            agent_id: "7",
            updated_at: "2026-01-01",
            created_at: "2026-01-01",
          },
        ],
        rowCount: 1,
      };
    }
    if (statement.includes('FROM "users"')) {
      return {
        rows: [
          {
            id: "4",
            name: "Staff",
            email: "staff@example.com",
            password: "stored-account-hash",
            updated_at: "2026-01-01",
            created_at: "2026-01-01",
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
});

function candidateProfile(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    name: "Amina Khatun",
    email: "amina@example.com",
    mobile: "01711111111",
    ...overrides,
  };
}

describe("candidate edit password handling", () => {
  it("does not offer password fields on the candidate edit form", async () => {
    const form = await loadBreadForm("candidates", "edit", 9, admin);
    expect(form?.fields.map((field) => field.name)).toEqual(["name", "email", "mobile"]);
    expect(form?.fields.some((field) => field.input === "password" || field.name.toLowerCase().includes("password"))).toBe(false);
  });

  it("saves a candidate profile without password fields", async () => {
    const saved = await saveBreadRecord(admin, "candidates", 9, candidateProfile(), null);
    const update = writes().find((call) => compact(call.sql).startsWith('UPDATE "candidates"'));
    expect(saved).toBe(9);
    expect(update?.params).toContain("Amina Khatun");
    expect(update?.sql).not.toMatch(/password/i);
    expect(hash).not.toHaveBeenCalled();
  });

  it("ignores password fields on candidate edit, including a mismatched confirmation", async () => {
    const saved = await saveBreadRecord(
      admin,
      "candidates",
      9,
      candidateProfile({
        password: SECRET,
        password_confirmation: "not-the-same-secret",
        password_hash: FORGED,
        current_password: "stored-secret",
        new_password: SECRET,
        confirm_password: SECRET,
      }),
      null,
    );
    const update = writes().find((call) => compact(call.sql).startsWith('UPDATE "candidates"'));
    expect(saved).toBe(9);
    expect(update?.params).toContain("Amina Khatun");
    expect(update?.sql).not.toMatch(/password/i);
    expect(writes().every((call) => !/password/i.test(call.sql))).toBe(true);
    expect(writes().every((call) => !call.params.includes(SECRET) && !call.params.includes(FORGED) && !call.params.includes(`hashed:${SECRET}`))).toBe(true);
    expect(writes().some((call) => /insert into users/i.test(call.sql) || /update\s+users\s+set\s+password/i.test(compact(call.sql)))).toBe(false);
    expect(hash).not.toHaveBeenCalled();
  });

  it("does not let an agent create a candidate, even with a stored add grant", async () => {
    await expect(
      saveBreadRecord(
        agent,
        "candidates",
        null,
        {
          name: "New Candidate",
          email: "new.candidate@example.com",
          mobile: "01822222222",
          password: INITIAL_PASSWORD,
          password_confirmation: INITIAL_PASSWORD,
        },
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(writes().some((call) => /insert into users/i.test(call.sql))).toBe(false);
    expect(hash).not.toHaveBeenCalled();
  });

  it("does not let an agent create a candidate when the password confirmation does not match", async () => {
    await expect(
      saveBreadRecord(
        agent,
        "candidates",
        null,
        {
          name: "New Candidate",
          email: "new.candidate@example.com",
          mobile: "01822222222",
          password: INITIAL_PASSWORD,
          password_confirmation: "different-secret-1",
        },
        null,
      ),
    ).rejects.toThrow("You cannot save this record.");
    expect(writes().some((call) => /insert into users/i.test(call.sql))).toBe(false);
    expect(hash).not.toHaveBeenCalled();
  });
});

describe("account password workflows", () => {
  it("still hashes a password submitted through user account editing", async () => {
    const saved = await saveBreadRecord(
      admin,
      "users",
      4,
      { name: "Staff", email: "staff@example.com", password: ACCOUNT_PASSWORD },
      null,
    );
    const update = writes().find((call) => compact(call.sql).startsWith('UPDATE "users"'));
    expect(saved).toBe(4);
    expect(update?.sql).toMatch(/"password"/);
    expect(update?.params).toContain(`hashed:${ACCOUNT_PASSWORD}`);
    expect(hash).toHaveBeenCalledWith(ACCOUNT_PASSWORD);
  });

  it("leaves the stored account hash in place when user edit omits a password", async () => {
    await saveBreadRecord(admin, "users", 4, { name: "Staff Member", email: "staff@example.com", password: "" }, null);
    const update = writes().find((call) => compact(call.sql).startsWith('UPDATE "users"'));
    expect(update?.params).toContain("Staff Member");
    expect(update?.sql).not.toMatch(/password/i);
    expect(update?.params).not.toContain("stored-account-hash");
    expect(hash).not.toHaveBeenCalled();
  });
});
