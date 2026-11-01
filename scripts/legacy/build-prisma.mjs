/**
 * Read-only parse of the phpMyAdmin MariaDB dump into a Prisma schema
 * and a column catalog used by the migration pipeline.
 * Does not modify the dump.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const dumpPath = process.argv[2] || path.resolve("docs/db.txt");
const schemaPath = path.resolve("prisma/schema.prisma");
const catalogPath = path.resolve("docs/legacy/column-catalog.json");

const EXCLUDED = new Set(["failed_jobs", "password_resets", "migrations"]);
const ARCHIVE_SNAPSHOTS = new Set([
  "payments_backup_01072026",
  "payments_backup_18062026",
  "payments_backup_20260625_0214pm",
  "payments_backup_210620261147am",
  "payments_bk",
  "payment_requests_backup_01072026",
]);

const MODEL_NAMES = {
  users: "User",
  roles: "Role",
  permissions: "Permission",
  candidates: "Candidate",
  agencies: "Agency",
  companies: "Company",
  countries: "Country",
  categories: "Category",
  currencies: "Currency",
  invoices: "Invoice",
  payments: "Payment",
  employees: "Employee",
  employers: "Employer",
  agents: "Agent",
  sub_agents: "SubAgent",
  agenciers: "Agencier",
  companiers: "Companier",
  teachers: "Teacher",
  districts: "District",
  divisions: "Division",
  thanas: "Thana",
  upazilas: "Upazila",
  unions: "Union",
  positions: "Position",
  settings: "Setting",
  notifications: "Notification",
  announcements: "Announcement",
  exams: "Exam",
  exam_results: "ExamResult",
  medicals: "Medical",
  licenses: "License",
  pages: "Page",
  posts: "Post",
  menus: "Menu",
  menu_items: "MenuItem",
  reports: "Report",
  skills: "Skill",
  trainings: "Training",
  translations: "Translation",
  user_types: "UserType",
  user_roles: "UserRole",
  permission_role: "PermissionRole",
  live_status: "LiveStatus",
  document_types: "DocumentType",
  class_groups: "ClassGroup",
  class_schedules: "ClassSchedule",
  flight_schedules: "FlightSchedule",
  labour_contracts: "LabourContract",
  police_clearances: "PoliceClearance",
  visa_immigrations: "VisaImmigration",
  invoice_lines: "InvoiceLine",
  invoice_heads: "InvoiceHead",
  invoice_candidates: "InvoiceCandidate",
  invoice_money_receipts: "InvoiceMoneyReceipt",
  ticket_companies: "TicketCompany",
  ticket_invoices: "TicketInvoice",
  ticket_invoice_lines: "TicketInvoiceLine",
  ticket_invoice_money_receipts: "TicketInvoiceMoneyReceipt",
  payment_requests: "PaymentRequest",
  sub_agent_payment_requests: "SubAgentPaymentRequest",
  candidate_documents: "CandidateDocument",
  selected_candidates: "SelectedCandidate",
  temp_candidates: "TempCandidate",
  employer_candidates: "EmployerCandidate",
  manpower_trainings: "ManpowerTraining",
  euro_to_bdt_rates: "EuroToBdtRate",
  license_positions: "LicensePosition",
  notification_class_groups: "NotificationClassGroup",
  announcement_class_groups: "AnnouncementClassGroup",
  professional_certificates: "ProfessionalCertificate",
  data_types: "DataType",
  data_rows: "DataRow",
  arcs: "Arc",
  experiences: "Experience",
  educations: "Education",
  language_list: "LanguageList",
  attribute_list: "AttributeList",
  curricular_list: "CurricularList",
  expertise_list: "ExpertiseList",
  interest_list: "InterestList",
  skill_list: "SkillList",
};

const SOFT_DELETE = new Set(["candidates", "agents", "sub_agents", "agenciers", "companiers"]);

function modelName(table) {
  if (MODEL_NAMES[table]) return MODEL_NAMES[table];
  return table
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function camel(name) {
  if (name === "order") return "sortOrder";
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function targetColumn(table, sourceColumn) {
  if (table === "manpower_trainings" && sourceColumn === "traininig_end_date") {
    return "training_end_date";
  }
  return sourceColumn;
}

function parseColumn(line) {
  const match = line.match(/^`([^`]+)`\s+(.+)$/);
  if (!match) return null;
  let rest = match[2].replace(/,\s*$/, "").trim();
  const typeMatch = rest.match(/^([a-zA-Z]+)(\((?:[^)(]+|\([^)]*\))*\))?/);
  if (!typeMatch) return null;
  const base = typeMatch[1].toLowerCase();
  const args = typeMatch[2] || "";
  rest = rest.slice(typeMatch[0].length).trim();
  const unsigned = /^unsigned\b/i.test(rest);
  if (unsigned) rest = rest.replace(/^unsigned\s*/i, "");
  const nullable = !/\bNOT NULL\b/i.test(rest);
  return { name: match[1], base, args, unsigned, nullable, raw: line.trim() };
}

function kindFor(table, column) {
  const name = column.name;
  const base = column.base;
  if (table === "medicals" && (name === "created_at" || name === "updated_at")) {
    return "timestamptz";
  }
  if (table === "candidates" && name === "linkedin_link") return "text";
  if (base === "date") return "date";
  if (base === "timestamp" || base === "datetime") return "timestamptz";
  if (base === "time") return "time";
  if (base === "json") return "json";
  if (base === "float" || base === "double" || base === "decimal" || base === "numeric") return "decimal";
  if (["int", "bigint", "tinyint", "smallint", "mediumint", "year"].includes(base)) return "int";
  if (base === "blob" || base === "longblob" || base === "mediumblob" || base === "tinyblob" || base === "binary" || base === "varbinary") {
    return "text";
  }
  return "text";
}

function prismaAttribute(table, column, targetName) {
  const kind = kindFor(table, column);
  const field = camel(targetName);
  const bits = [];
  let scalar = "String";
  if (kind === "int") scalar = "Int";
  else if (kind === "decimal") scalar = "Decimal";
  else if (kind === "timestamptz" || kind === "date") scalar = "DateTime";
  else if (kind === "json") scalar = "Json";
  if (column.nullable) scalar += "?";
  bits.push(scalar);
  if (field !== targetName) bits.push(`@map("${targetName}")`);
  if (kind === "timestamptz") bits.push("@db.Timestamptz(6)");
  if (kind === "date") bits.push("@db.Date");
  if (kind === "decimal") {
    const money = /amount|balance|price|rate|fee|vat|quantity/i.test(targetName);
    const rate = /rate/i.test(targetName);
    bits.push(rate ? "@db.Decimal(18, 6)" : money ? "@db.Decimal(15, 4)" : "@db.Decimal(16, 6)");
  }
  if (kind === "text" || kind === "time" || kind === "json") {
    const len = column.args.match(/\((\d+)\)/);
    if (column.base === "char" && len) bits.push(`@db.Char(${len[1]})`);
    else if ((column.base === "varchar" || column.base === "varbinary") && len && kind !== "text") {
      bits.push(`@db.VarChar(${len[1]})`);
    } else if (column.base === "varchar" && len && table !== "candidates" && column.name !== "linkedin_link") {
      const n = Number(len[1]);
      if (n > 0 && n <= 10485760) bits.push(`@db.VarChar(${n})`);
    } else if (kind === "text" && column.base !== "varchar") {
      bits.push("@db.Text");
    } else if (column.base === "varchar" && len) {
      bits.push(`@db.VarChar(${len[1]})`);
    } else if (kind === "time") {
      bits.push("@db.VarChar(16)");
    }
  }
  if (kind === "text" && column.base === "varchar") {
    // already handled
  }
  return { field, kind, line: `  ${field} ${bits.join(" ")}` };
}

function parseKeys(statement) {
  const keys = [];
  const re = /ADD\s+(UNIQUE\s+KEY|PRIMARY\s+KEY|KEY|CONSTRAINT)\s*(?:`[^`]+`\s*)?(?:\s*`[^`]+`\s*)?(?:FOREIGN\s+KEY\s*)?\(([^)]+)\)(?:\s*REFERENCES\s+`([^`]+)`\s*\(([^)]+)\))?([^,]*)/gi;
  let match;
  while ((match = re.exec(statement))) {
    const kind = match[1].toUpperCase();
    const cols = [...match[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const refTable = match[3] || null;
    const refCols = match[4] ? [...match[4].matchAll(/`([^`]+)`/g)].map((m) => m[1]) : [];
    const tail = match[5] || "";
    const onDelete = /ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/i.exec(tail);
    keys.push({
      kind: kind.includes("PRIMARY") ? "primary" : kind.includes("UNIQUE") ? "unique" : kind.includes("CONSTRAINT") ? "fk" : "index",
      cols,
      refTable,
      refCols,
      onDelete: onDelete ? onDelete[1].toUpperCase() : null,
    });
  }
  return keys;
}

async function extract() {
  const tables = new Map();
  let current = null;
  let buffer = [];
  let mode = null;
  const rl = readline.createInterface({
    input: fs.createReadStream(dumpPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!current && line.startsWith("CREATE TABLE `")) {
      const name = line.match(/`([^`]+)`/)[1];
      current = name;
      mode = "create";
      buffer = [];
      tables.set(name, { name, columns: [], keys: [] });
      continue;
    }
    if (mode === "create") {
      if (line.startsWith(") ENGINE=")) {
        mode = null;
        current = null;
        continue;
      }
      const column = parseColumn(line.trim());
      if (column) tables.get(current).columns.push(column);
      continue;
    }
    if (line.startsWith("ALTER TABLE `")) {
      const name = line.match(/`([^`]+)`/)[1];
      mode = "alter";
      current = name;
      buffer = [line];
      continue;
    }
    if (mode === "alter") {
      buffer.push(line);
      if (line.trim().endsWith(";")) {
        const statement = buffer.join("\n");
        const table = tables.get(current);
        if (table) table.keys.push(...parseKeys(statement));
        mode = null;
        current = null;
        buffer = [];
      }
    }
  }
  return tables;
}

function relationBlock(table, keys, fieldByColumn, nullableByColumn) {
  const lines = [];
  const back = [];
  for (const key of keys) {
    if (key.kind !== "fk" || key.cols.length !== 1 || !key.refTable) continue;
    if (EXCLUDED.has(key.refTable) || ARCHIVE_SNAPSHOTS.has(key.refTable)) continue;
    const col = key.cols[0];
    const field = fieldByColumn.get(col);
    if (!field) continue;
    const target = modelName(key.refTable);
    const optional = nullableByColumn.get(col) !== false;
    const rel = `${field}Ref`;
    let onDelete = "";
    if (key.onDelete === "CASCADE") onDelete = ", onDelete: Cascade";
    else if (key.onDelete === "SET NULL" && optional) onDelete = ", onDelete: SetNull";
    const name = `${modelName(table.name)}_${field}`;
    lines.push(
      `  ${rel} ${target}${optional ? "?" : ""} @relation("${name}", fields: [${field}], references: [id]${onDelete})`,
    );
    back.push({ targetTable: key.refTable, name, from: modelName(table.name) });
  }
  return { lines, back };
}

function renderTable(table) {
  const pk = table.keys.find((key) => key.kind === "primary");
  const pkCols = new Set((pk?.cols || ["id"]).map((col) => targetColumn(table.name, col)));
  const fieldByColumn = new Map();
  const nullableByColumn = new Map();
  const columnLines = [];
  const catalogColumns = [];

  for (const column of table.columns) {
    const targetName = targetColumn(table.name, column.name);
    let nullable = column.nullable;
    if (table.name === "districts" && column.name === "division_id") nullable = true;
    const adjusted = { ...column, nullable };
    const mapped = prismaAttribute(table.name, adjusted, targetName);
    fieldByColumn.set(column.name, mapped.field);
    nullableByColumn.set(column.name, nullable);
    let line = mapped.line;
    if (pkCols.size === 1 && pkCols.has(targetName)) {
      line += " @id";
      if (column.base === "int" || column.base === "bigint") line += " @default(autoincrement())";
    }
    columnLines.push(line);
    catalogColumns.push({
      source: column.name,
      target: targetName,
      field: mapped.field,
      kind: mapped.kind,
      nullable,
      primary: pkCols.has(targetName),
    });
  }

  if (SOFT_DELETE.has(table.name)) {
    columnLines.push(`  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)`);
  }
  if (table.name === "districts") {
    columnLines.push(`  verificationStatus String @default("source") @map("verification_status") @db.VarChar(40)`);
  }

  const uniques = table.keys.filter((key) => key.kind === "unique");
  const indexes = table.keys.filter((key) => key.kind === "index");
  const footer = [];
  if (pk && pk.cols.length > 1) {
    footer.push(`  @@id([${pk.cols.map((col) => fieldByColumn.get(col)).join(", ")}])`);
  }
  for (const unique of uniques) {
    const fields = unique.cols.map((col) => fieldByColumn.get(col)).filter(Boolean);
    if (fields.length) footer.push(`  @@unique([${fields.join(", ")}])`);
  }
  const indexed = new Set();
  for (const index of indexes) {
    const fields = index.cols.map((col) => fieldByColumn.get(col)).filter(Boolean);
    const signature = fields.join(",");
    if (!fields.length || indexed.has(signature)) continue;
    indexed.add(signature);
    footer.push(`  @@index([${fields.join(", ")}])`);
  }
  for (const column of table.columns) {
    if (!column.name.endsWith("_id")) continue;
    const field = fieldByColumn.get(column.name);
    if (!field || indexed.has(field) || (pkCols.size === 1 && pkCols.has(targetColumn(table.name, column.name)))) continue;
    indexed.add(field);
    footer.push(`  @@index([${field}])`);
  }

  const { lines: relations, back } = relationBlock(table, table.keys, fieldByColumn, nullableByColumn);
  const model = modelName(table.name);
  const body = [...columnLines, ...relations, ...footer, `  @@map("${table.name}")`];
  return {
    model,
    text: `model ${model} {\n${body.join("\n")}\n}\n`,
    catalog: {
      table: table.name,
      model,
      primaryKey: (pk?.cols || ["id"]).map((col) => targetColumn(table.name, col)),
      columns: catalogColumns,
      classification: "direct",
    },
    back,
  };
}

function systemModels() {
  return `
model Session {
  id               String    @id @db.VarChar(64)
  userId           Int       @map("user_id")
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz(6)
  absoluteExpiresAt DateTime @map("absolute_expires_at") @db.Timestamptz(6)
  revokedAt        DateTime? @map("revoked_at") @db.Timestamptz(6)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  ip               String?   @db.VarChar(64)
  userAgent        String?   @map("user_agent") @db.VarChar(400)
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model LoginAttempt {
  id        BigInt   @id @default(autoincrement())
  email     String   @db.VarChar(255)
  ip        String?  @db.VarChar(64)
  success   Boolean
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([email, createdAt])
  @@map("login_attempts")
}

model PasswordResetToken {
  id        BigInt    @id @default(autoincrement())
  userId    Int       @map("user_id")
  tokenHash String    @map("token_hash") @db.VarChar(128)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(6)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@map("password_reset_tokens")
}

model AuditLog {
  id         BigInt   @id @default(autoincrement())
  userId     Int?     @map("user_id")
  action     String   @db.VarChar(80)
  entityType String   @map("entity_type") @db.VarChar(80)
  entityId   String?  @map("entity_id") @db.VarChar(64)
  metadata   Json?
  ip         String?  @db.VarChar(64)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([entityType, entityId])
  @@index([userId, createdAt])
  @@map("audit_logs")
}

model Job {
  id          BigInt    @id @default(autoincrement())
  type        String    @db.VarChar(80)
  payload     Json
  status      String    @default("queued") @db.VarChar(20)
  attempts    Int       @default(0)
  maxAttempts Int       @default(5) @map("max_attempts")
  runAfter    DateTime  @default(now()) @map("run_after") @db.Timestamptz(6)
  lockedAt    DateTime? @map("locked_at") @db.Timestamptz(6)
  lastError   String?   @map("last_error") @db.Text
  result      Json?
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([status, runAfter])
  @@map("jobs")
}

model MigrationRun {
  id          String    @id @db.VarChar(64)
  sourceFile  String    @map("source_file") @db.VarChar(400)
  sourceSha256 String   @map("source_sha256") @db.VarChar(64)
  status      String    @db.VarChar(32)
  startedAt   DateTime  @default(now()) @map("started_at") @db.Timestamptz(6)
  finishedAt  DateTime? @map("finished_at") @db.Timestamptz(6)
  report      Json?

  @@map("migration_runs")
}

model MigrationTableResult {
  id            BigInt   @id @default(autoincrement())
  runId         String   @map("run_id") @db.VarChar(64)
  sourceTable   String   @map("source_table") @db.VarChar(120)
  targetTable   String   @map("target_table") @db.VarChar(120)
  sourceRows    Int      @map("source_rows")
  insertedRows  Int      @map("inserted_rows")
  skippedRows   Int      @map("skipped_rows")
  quarantinedRows Int    @map("quarantined_rows")
  transformedRows Int    @map("transformed_rows")
  status        String   @db.VarChar(32)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([runId, sourceTable])
  @@map("migration_table_results")
}

model MigrationQuarantine {
  id          BigInt   @id @default(autoincrement())
  runId       String   @map("run_id") @db.VarChar(64)
  sourceTable String   @map("source_table") @db.VarChar(120)
  sourcePk    String?  @map("source_pk") @db.VarChar(120)
  reason      String   @db.VarChar(200)
  rowData     Json     @map("row_data")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([runId, sourceTable])
  @@map("migration_quarantine")
}

model IdMap {
  id          BigInt @id @default(autoincrement())
  sourceTable String @map("source_table") @db.VarChar(120)
  sourceId    String @map("source_id") @db.VarChar(64)
  targetTable String @map("target_table") @db.VarChar(120)
  targetId    String @map("target_id") @db.VarChar(64)
  strategy    String @db.VarChar(40)

  @@unique([sourceTable, sourceId, targetTable])
  @@map("id_maps")
}

model BankAccount {
  id            BigInt   @id @default(autoincrement())
  ownerTable    String   @map("owner_table") @db.VarChar(80)
  ownerId       Int      @map("owner_id")
  accountName   String?  @map("account_name") @db.VarChar(250)
  accountNo     String?  @map("account_no") @db.VarChar(250)
  bankName      String?  @map("bank_name") @db.VarChar(250)
  branchName    String?  @map("branch_name") @db.VarChar(250)
  iban          String?  @db.VarChar(250)
  swift         String?  @db.VarChar(250)
  slot          String   @default("primary") @db.VarChar(20)
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([ownerTable, ownerId, slot])
  @@map("bank_accounts")
}

model PaymentSnapshot {
  id           BigInt   @id @default(autoincrement())
  snapshotName String   @map("snapshot_name") @db.VarChar(120)
  sourceId     Int?     @map("source_id")
  payload      Json
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([snapshotName, sourceId])
  @@map("payment_snapshots")
}

model StoredFile {
  id           String   @id @db.VarChar(64)
  ownerTable   String?  @map("owner_table") @db.VarChar(80)
  ownerId      String?  @map("owner_id") @db.VarChar(64)
  originalName String   @map("original_name") @db.VarChar(255)
  storagePath  String   @map("storage_path") @db.VarChar(500)
  mimeType     String   @map("mime_type") @db.VarChar(120)
  sizeBytes    Int      @map("size_bytes")
  createdBy    Int?     @map("created_by")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([ownerTable, ownerId])
  @@map("stored_files")
}
`;
}

const tables = await extract();
const rendered = [];
const catalog = [];
const backRelations = new Map();

for (const table of tables.values()) {
  if (EXCLUDED.has(table.name) || ARCHIVE_SNAPSHOTS.has(table.name)) {
    catalog.push({
      table: table.name,
      model: null,
      classification: EXCLUDED.has(table.name) ? "excluded" : "archive_snapshot",
      columns: table.columns.map((column) => ({
        source: column.name,
        target: column.name,
        kind: kindFor(table.name, column),
        nullable: column.nullable,
      })),
      primaryKey: (table.keys.find((key) => key.kind === "primary")?.cols || []).map((col) => col),
    });
    continue;
  }
  const result = renderTable(table);
  rendered.push(result);
  catalog.push(result.catalog);
  for (const back of result.back) {
    const list = backRelations.get(back.targetTable) || [];
    list.push(back);
    backRelations.set(back.targetTable, list);
  }
}

let schema = `// Generated from the legacy MariaDB dump. Do not hand-edit column mappings
// without updating docs/legacy/column-catalog.json via scripts/legacy/build-prisma.mjs.

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

`;

for (const result of rendered) {
  const extras = backRelations.get(result.catalog.table) || [];
  let text = result.text;
  if (result.catalog.table === "users") {
    text = text.replace(
      "  @@map(\"users\")",
      `  sessions Session[]
  passwordResetTokens PasswordResetToken[]
  @@map("users")`,
    );
  }
  if (extras.length) {
    const lines = extras.map((extra, index) => {
      const field = `${extra.from.charAt(0).toLowerCase()}${extra.from.slice(1)}Links${index}`;
      return `  ${field} ${extra.from}[] @relation("${extra.name}")`;
    });
    text = text.replace(`  @@map("${result.catalog.table}")`, `${lines.join("\n")}\n  @@map("${result.catalog.table}")`);
  }
  schema += text + "\n";
}

schema += systemModels();

fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
fs.writeFileSync(schemaPath, schema);
fs.writeFileSync(catalogPath, JSON.stringify({ generatedFrom: dumpPath, tables: catalog }, null, 2));

const direct = catalog.filter((item) => item.classification === "direct").length;
const excluded = catalog.filter((item) => item.classification === "excluded").length;
const archived = catalog.filter((item) => item.classification === "archive_snapshot").length;
console.log(`tables=${catalog.length} direct=${direct} excluded=${excluded} archived=${archived}`);
console.log(`schema=${schemaPath}`);
