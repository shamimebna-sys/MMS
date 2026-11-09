import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { guardPool, testDatabaseUrl } from "../helpers/pg-test-guard";

config({ path: path.join(process.cwd(), ".env") });

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20261105233000_foreign_key_integrity/migration.sql"),
  "utf8",
);
const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

const approved = [
  ["candidates", "agent_id", "agents", "Candidate_agentId"],
  ["candidates", "sub_agent_id", "sub_agents", "Candidate_subAgentId"],
  ["candidates", "agencier_id", "agenciers", "Candidate_agencierId"],
  ["candidates", "companier_id", "companiers", "Candidate_companierId"],
  ["employer_candidates", "candidate_id", "candidates", "EmployerCandidate_candidateId"],
  ["invoices", "agenciers_id", "agenciers", "Invoice_agenciersId"],
  ["invoices", "companier_id", "companiers", "Invoice_companierId"],
  ["licenses", "companier_id", "companiers", "License_companierId"],
  ["payment_requests", "agent_id", "agents", "PaymentRequest_agentId"],
  ["sub_agents", "agent_id", "agents", "SubAgent_agentId"],
  ["sub_agent_payment_requests", "sub_agent_id", "sub_agents", "SubAgentPaymentRequest_subAgentId"],
  ["ticket_invoices", "agencier_id", "agenciers", "TicketInvoice_agencierId"],
  ["ticket_invoices", "companier_id", "companiers", "TicketInvoice_companierId"],
  ["ticket_invoices", "agent_id", "agents", "TicketInvoice_agentId"],
  ["ticket_invoices", "candidate_id", "candidates", "TicketInvoice_candidateId"],
  ["users", "candidate_id", "candidates", "User_candidateId"],
  ["users", "sub_agent_id", "sub_agents", "User_subAgentId"],
  ["users", "agencier_id", "agenciers", "User_agencierId"],
  ["migration_table_results", "run_id", "migration_runs", "fields: [runId], references: [id], onDelete: Restrict, onUpdate: Cascade"],
  ["migration_quarantine", "run_id", "migration_runs", "fields: [runId], references: [id], onDelete: Restrict, onUpdate: Cascade"],
] as const;

function constraint(table: string, column: string, parent: string): string {
  return `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_${column}_fkey" FOREIGN KEY ("${column}") REFERENCES "${parent}"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`;
}

describe("foreign key integrity migration", () => {
  it("adds only restrict constraints and leaves stored rows untouched", () => {
    const statements = migration
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("ALTER TABLE"));
    expect(statements).toEqual(approved.map(([table, column, parent]) => constraint(table, column, parent)));
    expect(statements.join("\n")).not.toMatch(/ON DELETE CASCADE|ON DELETE SET NULL|DROP |DELETE FROM|UPDATE "|ALTER COLUMN|NOT NULL/i);
    for (const [table, column, , relation] of approved) {
      expect(schema).toContain(relation);
      expect(schema).toContain(`@map("${column}")`);
      expect(schema).toContain(`@@map("${table}")`);
    }
  });

  it("accepts a real parent, rejects a missing parent, keeps nulls, and blocks parent delete", async () => {
    const connectionString = testDatabaseUrl();
    const client = guardPool(new pg.Client({ connectionString }), {
      allowedSchemas: [],
      allowedUnqualifiedRelations: ["mp019_parent", "mp019_child", "mp019_required"],
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE mp019_parent (id integer PRIMARY KEY) ON COMMIT DROP;
        CREATE TEMP TABLE mp019_child (
          id integer PRIMARY KEY,
          parent_id integer,
          CONSTRAINT mp019_child_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES mp019_parent (id)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ) ON COMMIT DROP;
        CREATE TEMP TABLE mp019_required (
          id integer PRIMARY KEY,
          parent_id integer NOT NULL,
          CONSTRAINT mp019_required_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES mp019_parent (id)
            ON DELETE RESTRICT ON UPDATE CASCADE
        ) ON COMMIT DROP;
      `);
      await client.query("INSERT INTO mp019_parent (id) VALUES (1)");
      await client.query("INSERT INTO mp019_child (id, parent_id) VALUES (1, 1)");
      await client.query("INSERT INTO mp019_child (id, parent_id) VALUES (2, NULL)");
      await client.query("INSERT INTO mp019_required (id, parent_id) VALUES (1, 1)");

      await expectReject(client, "INSERT INTO mp019_child (id, parent_id) VALUES (3, 99)", "23503");
      await expectReject(client, "INSERT INTO mp019_required (id, parent_id) VALUES (2, 99)", "23503");
      await expectReject(client, "INSERT INTO mp019_required (id, parent_id) VALUES (3, NULL)", "23502");
      await expectReject(client, "DELETE FROM mp019_parent WHERE id = 1", "23503");

      const kept = await client.query("SELECT id, parent_id FROM mp019_child ORDER BY id");
      expect(kept.rows).toEqual([
        { id: 1, parent_id: 1 },
        { id: 2, parent_id: null },
      ]);
      const required = await client.query("SELECT id, parent_id FROM mp019_required ORDER BY id");
      expect(required.rows).toEqual([{ id: 1, parent_id: 1 }]);

      await client.query("DELETE FROM mp019_child WHERE id = 1");
      await client.query("DELETE FROM mp019_required WHERE id = 1");
      await client.query("DELETE FROM mp019_parent WHERE id = 1");
      const parents = await client.query("SELECT COUNT(*)::int AS count FROM mp019_parent");
      expect(parents.rows[0].count).toBe(0);
      const nullChild = await client.query("SELECT parent_id FROM mp019_child WHERE id = 2");
      expect(nullChild.rows[0].parent_id).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});

async function expectReject(client: pg.Client, sql: string, code: string): Promise<void> {
  await client.query("SAVEPOINT mp019_expect_reject");
  let rejected = false;
  try {
    await client.query(sql);
  } catch (error) {
    rejected = true;
    const actual = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    expect(actual).toBe(code);
  }
  await client.query("ROLLBACK TO SAVEPOINT mp019_expect_reject");
  expect(rejected).toBe(true);
}
