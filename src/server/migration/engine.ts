import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { Client } from "pg";
import catalogFile from "../../../docs/legacy/column-catalog.json";
import { SqlDumpScanner, type DumpRow } from "@/lib/legacy/scan-dump";
import { addDecimal, decimalEquals } from "@/lib/money";

type ColumnKind = "int" | "decimal" | "timestamptz" | "date" | "time" | "json" | "text";

type CatalogColumn = {
  source: string;
  target: string;
  kind: ColumnKind;
  nullable: boolean;
  primary?: boolean;
};

type CatalogTable = {
  table: string;
  model: string | null;
  classification: "direct" | "excluded" | "archive_snapshot";
  columns: CatalogColumn[];
  primaryKey: string[];
};

type Stage = "reference" | "full";

type TableStats = {
  sourceRows: number;
  insertedRows: number;
  skippedRows: number;
  quarantinedRows: number;
  transformedRows: number;
  excludedRows: number;
  status: string;
};

const catalog = catalogFile as { tables: CatalogTable[] };
const byTable = new Map(catalog.tables.map((table) => [table.table, table]));

const REFERENCE_TABLES = [
  "countries",
  "divisions",
  "districts",
  "thanas",
  "upazilas",
  "unions",
  "currencies",
  "euro_to_bdt_rates",
  "positions",
  "document_types",
  "live_status",
  "user_types",
  "categories",
  "roles",
  "permissions",
  "permission_role",
  "settings",
  "menus",
  "menu_items",
];

const LOAD_ORDER = [
  ...REFERENCE_TABLES,
  "data_types",
  "data_rows",
  "agents",
  "sub_agents",
  "agenciers",
  "companiers",
  "employees",
  "employers",
  "teachers",
  "class_groups",
  "positions",
  "candidates",
  "users",
  "user_roles",
  "temp_candidates",
  "selected_candidates",
  "candidate_documents",
  "class_schedules",
  "exams",
  "exam_results",
  "invoices",
  "invoice_heads",
  "invoice_lines",
  "invoice_candidates",
  "invoice_money_receipts",
  "payments",
  "payment_requests",
  "sub_agent_payment_requests",
  "licences",
  "licenses",
  "license_positions",
  "labour_contracts",
  "medicals",
  "police_clearances",
  "visa_immigrations",
  "arcs",
  "manpower_trainings",
  "trainings",
  "flight_schedules",
  "ticket_companies",
  "ticket_invoices",
  "ticket_invoice_lines",
  "ticket_invoice_money_receipts",
  "announcements",
  "announcement_class_groups",
  "notifications",
  "notification_class_groups",
];

const DEFERRED_SOURCE_COLUMNS: Record<string, string> = {
  candidates: "replaced_by_candidate_id",
  categories: "parent_id",
};

const GEO_PARENT: Record<string, { column: string; parent: "districts" | "upazilas" }> = {
  thanas: { column: "district_id", parent: "districts" },
  upazilas: { column: "district_id", parent: "districts" },
  unions: { column: "upazilla_id", parent: "upazilas" },
};

const REDACTED = new Set(["password", "remember_token", "token"]);
const MONEY_COLUMNS = new Set(["amount", "total_amount", "balance", "unit_price", "exchange_rate", "euro_rate"]);

export function assertLocalMigrationTarget(connectionString: string): void {
  const url = new URL(connectionString);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Refusing to migrate: the database host is not local.");
  }
  if (/prod/i.test(url.pathname) || process.env.MMS_ENV === "production") {
    throw new Error("Refusing to migrate a production database.");
  }
  if (process.env.MMS_ALLOW_MIGRATION !== "local-dev") {
    throw new Error("Set MMS_ALLOW_MIGRATION=local-dev to run the legacy migration against the local database.");
  }
}

function quoteIdent(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Refusing unsafe identifier ${identifier}`);
  }
  return `"${identifier}"`;
}

function orderedTables(stage: Stage): CatalogTable[] {
  const allowed = new Set(stage === "reference" ? REFERENCE_TABLES : catalog.tables.map((table) => table.table));
  const seen = new Set<string>();
  const ordered: CatalogTable[] = [];
  for (const name of LOAD_ORDER) {
    const table = byTable.get(name);
    if (!table || !allowed.has(name) || seen.has(name)) continue;
    seen.add(name);
    ordered.push(table);
  }
  for (const table of catalog.tables) {
    if (!allowed.has(table.table) || seen.has(table.table)) continue;
    ordered.push(table);
  }
  return ordered;
}

function coerce(column: CatalogColumn, raw: string | null): { value: unknown; transformed: boolean } {
  if (raw == null) {
    if (!column.nullable) throw new Error("required_value_missing");
    return { value: null, transformed: false };
  }
  let transformed = false;
  const text = raw.replaceAll("\u0000", "");
  if (text !== raw) transformed = true;
  if (text === "0000-00-00" || text.startsWith("0000-00-00 ")) {
    if (!column.nullable) throw new Error("zero_date_in_required_column");
    return { value: null, transformed: true };
  }
  if (text === "" && column.kind !== "text") {
    if (!column.nullable) throw new Error("blank_value");
    return { value: null, transformed: true };
  }
  if (column.kind === "int") {
    if (text === "") {
      if (!column.nullable) throw new Error("blank_integer");
      return { value: null, transformed: true };
    }
    if (!/^-?\d+$/.test(text)) throw new Error("invalid_integer");
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value > 2147483647 || value < -2147483648) {
      throw new Error("integer_out_of_range");
    }
    return { value, transformed };
  }
  if (column.kind === "decimal") {
    if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error("invalid_decimal");
    return { value: text, transformed };
  }
  if (column.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("invalid_date");
    return { value: text, transformed };
  }
  if (column.kind === "timestamptz") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return { value: `${text}T00:00:00Z`, transformed: true };
    }
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) throw new Error("invalid_timestamp");
    return { value: text.replace(" ", "T").replace(/Z?$/, "Z"), transformed };
  }
  if (column.kind === "time") return { value: text.slice(0, 16), transformed };
  if (column.kind === "json") {
    JSON.parse(text);
    return { value: text, transformed };
  }
  return { value: text, transformed };
}

function redactRow(columns: string[], row: DumpRow): Record<string, string | null> {
  const output: Record<string, string | null> = {};
  columns.forEach((column, index) => {
    const value = row[index];
    if (REDACTED.has(column)) output[column] = "[redacted]";
    else if (value != null && value.length > 200) output[column] = `${value.slice(0, 200)}…`;
    else output[column] = value;
  });
  return output;
}

function rawPrimaryKey(table: CatalogTable, sourceColumns: string[], raw: DumpRow): string {
  const keys = table.primaryKey.length ? table.primaryKey : ["id"];
  return keys
    .map((key) => {
      const index = sourceColumns.indexOf(key);
      return index >= 0 ? String(raw[index] ?? "") : "";
    })
    .join("|")
    .slice(0, 120);
}

function valuePrimaryKey(table: CatalogTable, columns: string[], values: unknown[]): string {
  if (table.classification === "archive_snapshot") return String(values[1] ?? "").slice(0, 120);
  const keys = table.primaryKey.length ? table.primaryKey : ["id"];
  return keys
    .map((key) => {
      const index = columns.indexOf(key);
      return index >= 0 ? String(values[index] ?? "") : "";
    })
    .join("|")
    .slice(0, 120);
}

function quarantinePayload(columns: string[], values: unknown[]): string {
  const output: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    if (REDACTED.has(column)) {
      output[column] = "[redacted]";
      return;
    }
    const value = values[index];
    output[column] = typeof value === "string" && value.length > 200 ? `${value.slice(0, 200)}…` : value;
  });
  return JSON.stringify(output);
}

async function writeLine(stream: fs.WriteStream, line: string): Promise<void> {
  if (!stream.write(`${line}\n`)) {
    await new Promise<void>((resolve) => stream.once("drain", resolve));
  }
}

export async function migrateLegacy(options: { stage?: Stage } = {}): Promise<{ runId: string; reportPath: string }> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  assertLocalMigrationTarget(connectionString);
  const stage = options.stage ?? "full";
  const dumpPath = path.resolve(process.env.LEGACY_DUMP_PATH || "docs/db.txt");
  if (!fs.existsSync(dumpPath)) throw new Error(`Legacy dump was not found at ${dumpPath}`);

  const runId = `mig_${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}_${stage}`;
  const root = path.resolve("data", "migration", runId);
  const staging = path.join(root, "staging");
  await fsp.mkdir(staging, { recursive: true });
  const snapshotPath = path.join(root, "source-snapshot.sql");
  await fsp.copyFile(dumpPath, snapshotPath);

  const hash = createHash("sha256");
  const streams = new Map<string, fs.WriteStream>();
  const columnsByTable = new Map<string, string[]>();
  const seenKeys = new Map<string, Set<string>>();
  const sourceCounts = new Map<string, number>();
  const sourceMoney = new Map<string, string>();
  const duplicateQuarantine: Array<{ table: string; pk: string; row: Record<string, string | null> }> = [];

  const selected = new Set(orderedTables(stage).map((table) => table.table));

  const scanner = new SqlDumpScanner({
    onRow: async (table, columns, row) => {
      sourceCounts.set(table, (sourceCounts.get(table) ?? 0) + 1);
      const meta = byTable.get(table);
      if (!meta || !selected.has(table) || meta.classification === "excluded") return;
      if (!columnsByTable.has(table)) {
        columnsByTable.set(table, columns);
        const stream = fs.createWriteStream(path.join(staging, `${table}.ndjson`), { encoding: "utf8" });
        streams.set(table, stream);
        await fsp.writeFile(path.join(staging, `${table}.columns.json`), JSON.stringify(columns));
      }
      const pkIndex = meta.primaryKey.map((column) => columns.indexOf(column));
      const pk = pkIndex.every((index) => index >= 0) ? pkIndex.map((index) => row[index] ?? "").join("|") : "";
      if (pk) {
        const seen = seenKeys.get(table) ?? new Set<string>();
        if (seen.has(pk)) {
          duplicateQuarantine.push({ table, pk, row: redactRow(columns, row) });
          return;
        }
        seen.add(pk);
        seenKeys.set(table, seen);
      }
      for (const column of columns) {
        if (!MONEY_COLUMNS.has(column)) continue;
        const index = columns.indexOf(column);
        const raw = row[index];
        if (raw && /^-?\d+(\.\d+)?$/.test(raw)) {
          const key = `${table}.${column}`;
          sourceMoney.set(key, addDecimal(sourceMoney.get(key) ?? "0", raw));
        }
      }
      const stream = streams.get(table);
      if (stream) await writeLine(stream, JSON.stringify(row));
    },
  });

  const input = fs.createReadStream(snapshotPath, { encoding: "utf8" });
  for await (const chunk of input) {
    hash.update(chunk);
    await scanner.push(chunk);
  }
  await scanner.finish();
  await Promise.all([...streams.values()].map((stream) => new Promise<void>((resolve) => stream.end(resolve))));
  const sourceSha256 = hash.digest("hex");

  const client = new Client({ connectionString });
  await client.connect();
  const stats = new Map<string, TableStats>();
  const deferredUpdates: Array<{ table: string; column: string; id: string; value: string }> = [];
  const parentIds = new Map<string, Set<number>>();

  try {
    await client.query("SET statement_timeout = 0");
    await client.query(
      `INSERT INTO migration_runs (id, source_file, source_sha256, status) VALUES ($1, $2, $3, 'running')`,
      [runId, dumpPath, sourceSha256],
    );

    for (const item of duplicateQuarantine) {
      await client.query(
        `INSERT INTO migration_quarantine (run_id, source_table, source_pk, reason, row_data) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [runId, item.table, item.pk, "duplicate_source_identifier", JSON.stringify(item.row)],
      );
    }

    for (const table of orderedTables(stage)) {
      const result = await loadTable(client, table, staging, runId, deferredUpdates, parentIds);
      const duplicates = duplicateQuarantine.filter((item) => item.table === table.table).length;
      result.quarantinedRows += duplicates;
      result.sourceRows = sourceCounts.get(table.table) ?? 0;
      if (table.classification === "excluded") {
        result.excludedRows = result.sourceRows;
        result.status = "excluded";
      }
      stats.set(table.table, result);
      if (table.table === "districts" || table.table === "upazilas") {
        parentIds.set(table.table, await loadIdSet(client, table.table));
      }
      await client.query(
        `INSERT INTO migration_table_results
          (run_id, source_table, target_table, source_rows, inserted_rows, skipped_rows, quarantined_rows, transformed_rows, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          runId,
          table.table,
          table.classification === "archive_snapshot" ? "payment_snapshots" : table.table,
          result.sourceRows,
          result.insertedRows,
          result.skippedRows,
          result.quarantinedRows,
          result.transformedRows,
          result.status,
        ],
      );
      const targetTable = table.classification === "archive_snapshot" ? "payment_snapshots" : table.table;
      if (table.classification !== "excluded") {
        await client.query(
          `INSERT INTO id_maps (source_table, source_id, target_table, target_id, strategy)
           VALUES ($1, '*', $2, '*', 'preserve_legacy_id')
           ON CONFLICT (source_table, source_id, target_table) DO NOTHING`,
          [table.table, targetTable],
        );
      }
      console.log(
        `${table.table}: source=${result.sourceRows} inserted=${result.insertedRows} skipped=${result.skippedRows} quarantined=${result.quarantinedRows} transformed=${result.transformedRows}`,
      );
    }

    for (const update of deferredUpdates) {
      const column = quoteIdent(update.column);
      try {
        await client.query(`UPDATE ${quoteIdent(update.table)} SET ${column} = $1 WHERE id = $2`, [
          update.value,
          update.id,
        ]);
      } catch (error) {
        await client.query(
          `INSERT INTO migration_quarantine (run_id, source_table, source_pk, reason, row_data) VALUES ($1,$2,$3,$4,$5::jsonb)`,
          [
            runId,
            update.table,
            update.id,
            error instanceof Error ? `deferred_update:${error.message.slice(0, 160)}` : "deferred_update_failed",
            "{}",
          ],
        );
      }
    }
    await syncSequences(client, orderedTables(stage));
    await extractBankAccounts(client);

    const money = await reconcileMoney(client, sourceMoney);
    const orphans = await orphanReport(client);
    const accounted = [...stats.values()].every(
      (item) => item.sourceRows === item.insertedRows + item.skippedRows + item.quarantinedRows + item.excludedRows,
    );
    const report = {
      runId,
      stage,
      sourceSha256,
      accounted,
      moneyBalanced: money.every((item) => item.equal),
      tables: Object.fromEntries(stats),
      money,
      orphans,
      decisions: {
        timestamps: "Dump session time_zone is +00:00, so timestamp literals are stored as UTC.",
        districts65_66_72:
          "Districts 65, 66, and 72 are absent from the source and were not invented. Thanas, upazilas, and unions that require those missing parents are quarantined.",
        paymentBackups: "Archived in payment_snapshots and not merged into payments.",
        excluded: ["failed_jobs", "password_resets", "migrations"],
      },
    };
    const reportPath = path.join(root, "report.json");
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    await client.query(`UPDATE migration_runs SET status = $2, finished_at = NOW(), report = $3::jsonb WHERE id = $1`, [
      runId,
      accounted ? "reconciled" : "completed_with_exceptions",
      JSON.stringify(report),
    ]);
    return { runId, reportPath };
  } catch (error) {
    await client
      .query(`UPDATE migration_runs SET status = 'failed', finished_at = NOW() WHERE id = $1`, [runId])
      .catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function loadTable(
  client: Client,
  table: CatalogTable,
  staging: string,
  runId: string,
  deferredUpdates: Array<{ table: string; column: string; id: string; value: string }>,
  parentIds: Map<string, Set<number>>,
): Promise<TableStats> {
  const stats: TableStats = {
    sourceRows: 0,
    insertedRows: 0,
    skippedRows: 0,
    quarantinedRows: 0,
    transformedRows: 0,
    excludedRows: 0,
    status: "loaded",
  };
  if (table.classification === "excluded") {
    stats.status = "excluded";
    return stats;
  }
  const file = path.join(staging, `${table.table}.ndjson`);
  if (!fs.existsSync(file)) {
    stats.status = "empty";
    return stats;
  }
  const sourceColumns = JSON.parse(await fsp.readFile(path.join(staging, `${table.table}.columns.json`), "utf8")) as string[];
  const columnMeta = new Map(table.columns.map((column) => [column.source, column]));
  const deferred = DEFERRED_SOURCE_COLUMNS[table.table];
  const targetColumns =
    table.classification === "archive_snapshot"
      ? ["snapshot_name", "source_id", "payload"]
      : sourceColumns.map((column) => columnMeta.get(column)?.target || column).filter((column) => column !== deferred);

  const batchSize = Math.max(1, Math.min(200, Math.floor(50000 / Math.max(targetColumns.length, 1))));
  let batch: unknown[][] = [];

  const flush = async () => {
    if (!batch.length) return;
    try {
      const inserted = await insertBatch(client, table, targetColumns, batch);
      stats.insertedRows += inserted;
      stats.skippedRows += batch.length - inserted;
    } catch {
      for (const values of batch) {
        try {
          const inserted = await insertBatch(client, table, targetColumns, [values]);
          stats.insertedRows += inserted;
          stats.skippedRows += 1 - inserted;
        } catch (error) {
          const message = error instanceof Error ? error.message : "insert_failed";
          const roleIndex = targetColumns.indexOf("role_id");
          if (table.table === "users" && roleIndex >= 0 && values[roleIndex] != null && /foreign key/i.test(message)) {
            const retry = values.slice();
            retry[roleIndex] = null;
            try {
              const inserted = await insertBatch(client, table, targetColumns, [retry]);
              stats.insertedRows += inserted;
              stats.skippedRows += 1 - inserted;
              stats.transformedRows += 1;
              await client.query(
                `INSERT INTO migration_quarantine (run_id, source_table, source_pk, reason, row_data) VALUES ($1,$2,$3,$4,$5::jsonb)`,
                [runId, table.table, valuePrimaryKey(table, targetColumns, values), "role_id_missing_nulled", "{}"],
              );
              continue;
            } catch {
              // Fall through and quarantine the original row.
            }
          }
          stats.quarantinedRows += 1;
          const pk = valuePrimaryKey(table, targetColumns, values);
          await client.query(
            `INSERT INTO migration_quarantine (run_id, source_table, source_pk, reason, row_data) VALUES ($1,$2,$3,$4,$5::jsonb)`,
            [runId, table.table, pk, message.slice(0, 180), quarantinePayload(targetColumns, values)],
          );
        }
      }
    }
    batch = [];
  };

  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const raw = JSON.parse(line) as DumpRow;
    try {
      const geo = GEO_PARENT[table.table];
      if (geo && table.classification === "direct") {
        const index = sourceColumns.indexOf(geo.column);
        const rawParent = index >= 0 ? raw[index] : null;
        if (rawParent != null && rawParent !== "") {
          const parentId = Number(rawParent);
          const known = parentIds.get(geo.parent);
          if (known && Number.isInteger(parentId) && !known.has(parentId)) {
            throw new Error(`missing_${geo.parent}_reference:${parentId}`);
          }
        }
      }
      if (table.classification === "archive_snapshot") {
        const sourceId = sourceColumns.indexOf("id") >= 0 ? Number(raw[sourceColumns.indexOf("id")]) : null;
        const payload = redactRow(sourceColumns, raw);
        batch.push([table.table, Number.isInteger(sourceId) ? sourceId : null, JSON.stringify(payload)]);
      } else {
        const values: unknown[] = [];
        let transformed = false;
        sourceColumns.forEach((source, index) => {
          if (source === deferred) {
            const idIndex = sourceColumns.indexOf("id");
            if (raw[index] && idIndex >= 0) {
              deferredUpdates.push({
                table: table.table,
                column: columnMeta.get(source)?.target || source,
                id: String(raw[idIndex]),
                value: String(raw[index]),
              });
              transformed = true;
            }
            return;
          }
          const column = columnMeta.get(source);
          if (!column) throw new Error(`unmapped_column:${source}`);
          const coerced = coerce(column, raw[index]);
          transformed ||= coerced.transformed;
          values.push(coerced.value);
        });
        if (transformed) stats.transformedRows += 1;
        batch.push(values);
      }
      if (batch.length >= batchSize) await flush();
    } catch (error) {
      stats.quarantinedRows += 1;
      await client.query(
        `INSERT INTO migration_quarantine (run_id, source_table, source_pk, reason, row_data) VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [
          runId,
          table.table,
          rawPrimaryKey(table, sourceColumns, raw),
          error instanceof Error ? error.message.slice(0, 180) : "transform_failed",
          JSON.stringify(redactRow(sourceColumns, raw)),
        ],
      );
    }
  }
  await flush();
  return stats;
}

async function insertBatch(client: Client, table: CatalogTable, columns: string[], rows: unknown[][]): Promise<number> {
  const target = table.classification === "archive_snapshot" ? "payment_snapshots" : table.table;
  const jsonColumns = new Set(
    table.classification === "archive_snapshot"
      ? ["payload"]
      : table.columns.filter((column) => column.kind === "json").map((column) => column.target),
  );
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value, index) => {
      params.push(value);
      const cast = jsonColumns.has(columns[index] ?? "") ? "::jsonb" : "";
      return `$${params.length}${cast}`;
    });
    return `(${placeholders.join(",")})`;
  });
  const conflict =
    table.classification === "direct" && table.primaryKey.length
      ? ` ON CONFLICT (${table.primaryKey.map(quoteIdent).join(",")}) DO NOTHING`
      : table.classification === "archive_snapshot"
        ? ` ON CONFLICT (snapshot_name, source_id) DO NOTHING`
        : "";
  const sql = `INSERT INTO ${quoteIdent(target)} (${columns.map(quoteIdent).join(",")}) VALUES ${tuples.join(",")}${conflict}`;
  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}

async function loadIdSet(client: Client, table: string): Promise<Set<number>> {
  const result = await client.query(`SELECT id FROM ${quoteIdent(table)}`);
  return new Set(result.rows.map((row: { id: number }) => Number(row.id)));
}

async function syncSequences(client: Client, tables: CatalogTable[]): Promise<void> {
  for (const table of tables) {
    if (table.classification !== "direct" || table.primaryKey.length !== 1 || table.primaryKey[0] !== "id") continue;
    try {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${quoteIdent(table.table)}), 1), 1), true)`,
        [table.table],
      );
    } catch {
      // Some integer primary keys do not own a sequence. The loaded ids remain valid.
    }
  }
}

async function extractBankAccounts(client: Client): Promise<void> {
  const statements = [
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'agenciers', id, bank_account_name, bank_account_no, bank_name, bank_branch_name, bank_iban_no, bank_swift_no, 'primary'
     FROM agenciers
     WHERE COALESCE(bank_account_no, bank_name, bank_iban_no, bank_swift_no) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'invoices', id, bank_account_name, bank_account_no, bank_name, bank_branch_name, bank_iban_no, bank_swift_no, 'primary'
     FROM invoices
     WHERE COALESCE(bank_account_no, bank_name, bank_iban_no, bank_swift_no) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'ticket_companies', id, bank_account_name_1, bank_account_no_1, bank_name_1, bank_branch_name_1, bank_iban_no_1, bank_swift_no_1, 'primary'
     FROM ticket_companies
     WHERE COALESCE(bank_account_no_1, bank_name_1, bank_iban_no_1, bank_swift_no_1) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'ticket_companies', id, bank_account_name_2, bank_account_no_2, bank_name_2, bank_branch_name_2, bank_iban_no_2, bank_swift_no_2, 'secondary'
     FROM ticket_companies
     WHERE COALESCE(bank_account_no_2, bank_name_2, bank_iban_no_2, bank_swift_no_2) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'ticket_invoices', id, bank_account_name_1, bank_account_no_1, bank_name_1, bank_branch_name_1, bank_iban_no_1, bank_swift_no_1, 'primary'
     FROM ticket_invoices
     WHERE COALESCE(bank_account_no_1, bank_name_1, bank_iban_no_1, bank_swift_no_1) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
    `INSERT INTO bank_accounts (owner_table, owner_id, account_name, account_no, bank_name, branch_name, iban, swift, slot)
     SELECT 'ticket_invoices', id, bank_account_name_2, bank_account_no_2, bank_name_2, bank_branch_name_2, bank_iban_no_2, bank_swift_no_2, 'secondary'
     FROM ticket_invoices
     WHERE COALESCE(bank_account_no_2, bank_name_2, bank_iban_no_2, bank_swift_no_2) IS NOT NULL
     ON CONFLICT (owner_table, owner_id, slot) DO NOTHING`,
  ];
  for (const statement of statements) await client.query(statement);
}

async function reconcileMoney(client: Client, sourceMoney: Map<string, string>) {
  const checks: Array<{ key: string; source: string; target: string | null; equal: boolean; note?: string }> = [];
  for (const [key, source] of sourceMoney) {
    const [table, column] = key.split(".");
    const meta = table ? byTable.get(table) : undefined;
    if (!table || !column || !meta || meta.classification !== "direct") {
      checks.push({ key, source, target: null, equal: true, note: "archived_or_unmapped" });
      continue;
    }
    try {
      const result = await client.query(`SELECT COALESCE(SUM(${quoteIdent(column)}), 0)::text AS total FROM ${quoteIdent(table)}`);
      const target = result.rows[0]?.total ?? null;
      checks.push({ key, source, target, equal: target != null && decimalEquals(source, target) });
    } catch (error) {
      checks.push({
        key,
        source,
        target: null,
        equal: false,
        note: error instanceof Error ? error.message.slice(0, 160) : "sum_failed",
      });
    }
  }
  return checks;
}

async function orphanReport(client: Client) {
  const queries: Array<[string, string]> = [
    [
      "candidates_missing_agent",
      `SELECT COUNT(*)::int AS count FROM candidates c LEFT JOIN agents a ON a.id = c.agent_id WHERE c.agent_id IS NOT NULL AND c.agent_id <> 0 AND a.id IS NULL`,
    ],
    [
      "thanas_missing_district",
      `SELECT COUNT(*)::int AS count FROM thanas t LEFT JOIN districts d ON d.id = t.district_id WHERE d.id IS NULL`,
    ],
    [
      "upazilas_missing_district",
      `SELECT COUNT(*)::int AS count FROM upazilas u LEFT JOIN districts d ON d.id = u.district_id WHERE d.id IS NULL`,
    ],
    [
      "unions_missing_upazila",
      `SELECT COUNT(*)::int AS count FROM unions u LEFT JOIN upazilas z ON z.id = u.upazilla_id WHERE z.id IS NULL`,
    ],
    [
      "police_clearances_missing_thana",
      `SELECT COUNT(*)::int AS count FROM police_clearances p LEFT JOIN thanas t ON t.id = p.thana_id WHERE p.thana_id IS NOT NULL AND t.id IS NULL`,
    ],
    [
      "users_missing_role",
      `SELECT COUNT(*)::int AS count FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.role_id IS NOT NULL AND r.id IS NULL`,
    ],
  ];
  const output: Record<string, number> = {};
  for (const [name, sql] of queries) {
    try {
      const result = await client.query(sql);
      output[name] = result.rows[0]?.count ?? 0;
    } catch {
      output[name] = -1;
    }
  }
  return output;
}
