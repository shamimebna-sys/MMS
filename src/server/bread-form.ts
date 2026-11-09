import { canMutateTable, recordScope, type AccessUser } from "@/lib/auth/permissions";
import { assertLegacySnapshotPreserved, isLegacySnapshotTable } from "@/lib/legacy-snapshots";
import { hashPassword } from "@/lib/auth/password";
import { assignedPassportField, retainPassportHistory } from "@/lib/candidate-passport";
import { assignLegacyCandidateCode, CANDIDATE_CODE_AGENT_MESSAGE, lockedAgentPrefix } from "@/lib/legacy-candidate-code";
import { pool } from "@/lib/db";
import {
  acceptedIdempotencyKey,
  decideSubmission,
  fingerprintAssigned,
  IdempotencyConflictError,
  IdempotentReplay,
  isUniqueViolation,
  newIdempotencyKey,
  sha256Hex,
  submissionOwnedBy,
} from "@/lib/payment-idempotency";
import { writeAudit } from "@/server/audit";
import { readPaymentFacts, syncPaymentChange, withPgTransaction } from "@/server/payment-ledger";
import { readStoredFingerprint } from "@/server/payment-idempotency";
import { applyPaymentBalance, type SqlClient } from "@/lib/payment-ledger";
import { arcDataType, arcFieldRows, isArcSlug } from "@/lib/arc-records";
import { isMoneyReceiptSlug, moneyReceiptDataType, moneyReceiptFieldRows } from "@/lib/money-receipts";
import {
  SUB_AGENT_PAYMENT_STATUS_DEFAULT,
  isSubAgentPaymentRequestSlug,
  subAgentPaymentAmountError,
  subAgentPaymentRequestDataType,
  subAgentPaymentRequestFieldRows,
} from "@/lib/sub-agent-payment-requests";
import { classScheduleDataType, classScheduleFieldRows, isClassScheduleSlug } from "@/lib/class-schedules";
import { euroToBdtRateDataType, euroToBdtRateFieldRows, isEuroToBdtRateSlug } from "@/lib/euro-to-bdt-rates";
import { currencyDataType, currencyFieldRows, isCurrencySlug } from "@/lib/currencies";
import { isSettingsSlug } from "@/lib/settings";
import { isTicketInvoiceMoneyReceiptSlug, ticketInvoiceMoneyReceiptDataType, ticketInvoiceMoneyReceiptFieldRows } from "@/lib/ticket-invoice-money-receipts";
import { quoteIdent, resolveResource, visibilitySql, type ResourceDef, type ScopeMode } from "@/server/resources";
import { releaseStoredUploads, storeUpload } from "@/server/uploads";
import { dropDuplicateUserRoleText } from "@/server/user-role-field";

const RECORD_COMMITTED = new WeakSet<object>();

export class UploadDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadDeniedError";
  }
}

function markRecordCommitted(error: unknown): void {
  if (typeof error === "object" && error !== null) RECORD_COMMITTED.add(error);
}

function recordWasCommitted(error: unknown): boolean {
  return typeof error === "object" && error !== null && RECORD_COMMITTED.has(error);
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function isCredentialField(field: { name: string; input: string }): boolean {
  return field.input === "password" || field.name.toLowerCase().includes("password");
}

export type FormChoice = { value: string; label: string };

export type FormField = {
  name: string;
  label: string;
  input: "text" | "textarea" | "number" | "date" | "time" | "email" | "password" | "checkbox" | "select" | "file" | "hidden";
  required: boolean;
  multiple: boolean;
  options: FormChoice[];
  value: string;
  readOnly?: boolean;
  /** Shown only while the control value is empty. Not submitted. */
  placeholder?: string;
  maxLength?: number;
  /** null omits the file filter. Undefined keeps the shared file default. */
  accept?: string | null;
};

type FieldRow = {
  field: string;
  type: string;
  display_name: string;
  required: number;
  details: string | null;
};

type RelDetails = {
  table?: string;
  type?: string;
  column?: string;
  key?: string;
  label?: string;
  pivot_table?: string;
  options?: Record<string, string> | string[];
  default?: string;
};

function safe(value: string | undefined): string | null {
  if (!value || !IDENT.test(value)) return null;
  return value;
}

function detailsOf(raw: string | null): RelDetails {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RelDetails;
  } catch {
    return {};
  }
}

function choices(details: RelDetails): FormChoice[] {
  const options = details.options;
  if (Array.isArray(options)) return options.map((option) => ({ value: String(option), label: String(option) }));
  if (options && typeof options === "object") {
    return Object.entries(options)
      .filter(([value]) => value !== "")
      .map(([value, label]) => ({ value, label: String(label) }));
  }
  return [];
}

async function columnTypes(table: string): Promise<Map<string, string>> {
  const result = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return new Map(result.rows.map((row: { column_name: string; data_type: string }) => [row.column_name, row.data_type]));
}

async function columnSet(table: string): Promise<Set<string>> {
  const types = await columnTypes(table);
  return new Set(types.keys());
}

type ColumnCatalog = Map<string, Map<string, string>>;

/** Tables this form load may check. The catalog built from them is local to the call. */
function formMetadataTables(table: string, rows: FieldRow[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  add(table);
  for (const row of rows) {
    if (row.type !== "relationship") continue;
    const details = detailsOf(row.details);
    if (details.type !== "belongsTo") continue;
    const related = safe(details.table);
    const column = safe(details.column);
    if (!related || !column) continue;
    add(related);
  }
  return names;
}

async function loadColumnCatalog(tables: string[]): Promise<ColumnCatalog> {
  const catalog: ColumnCatalog = new Map(tables.map((table) => [table, new Map()]));
  if (tables.length === 0) return catalog;
  const result = await pool.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tables],
  );
  for (const row of result.rows as { table_name: string; column_name: string; data_type: string }[]) {
    catalog.get(row.table_name)?.set(row.column_name, row.data_type);
  }
  return catalog;
}

function columnNames(catalog: ColumnCatalog, table: string): Set<string> {
  return new Set(catalog.get(table)?.keys() ?? []);
}

function scopeFor(table: string, columns: Set<string>): ResourceDef {
  const existing = resolveResource(table) ?? resolveResource(table.replace(/_/g, "-"));
  if (existing) return existing;
  let scope: ScopeMode = { mode: "reference" };
  if (table === "sub_agents" && columns.has("agent_id")) {
    scope = { mode: "column", candidate: "id", agent: "agent_id", subAgent: "id", agencier: "agent_id", companier: "agent_id" };
  } else if (columns.has("candidate_id")) scope = { mode: "candidate-child", column: "candidate_id" };
  return { slug: table, table, title: table, group: "", columns: ["id"], search: [], softDelete: columns.has("deleted_at"), scope };
}

async function typeOf(slug: string): Promise<{ id: number; slug: string; table: string; title: string; synthetic?: boolean } | null> {
  const result = await pool.query(
    `SELECT id, slug, name, display_name_singular FROM data_types
     WHERE slug = $1 OR name = $1 OR slug = replace($1, '_', '-') OR name = replace($1, '-', '_')
     LIMIT 1`,
    [slug],
  );
  const row = result.rows[0] as { id: number; slug: string; name: string; display_name_singular: string } | undefined;
  if (row) return { id: row.id, slug: row.slug, table: row.name, title: row.display_name_singular };
  if (isArcSlug(slug)) return arcDataType("form");
  if (isMoneyReceiptSlug(slug)) return moneyReceiptDataType("form");
  if (isSubAgentPaymentRequestSlug(slug)) return subAgentPaymentRequestDataType("form");
  if (isClassScheduleSlug(slug)) return classScheduleDataType("form");
  if (isEuroToBdtRateSlug(slug)) return euroToBdtRateDataType("form");
  if (isCurrencySlug(slug)) return currencyDataType("form");
  if (isTicketInvoiceMoneyReceiptSlug(slug)) return ticketInvoiceMoneyReceiptDataType("form");
  return null;
}

function inputFor(type: string): FormField["input"] {
  if (type === "text_area" || type === "rich_text_box" || type === "markdown_editor" || type === "code_editor") return "textarea";
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "time") return "time";
  if (type === "email") return "email";
  if (type === "password") return "password";
  if (type === "image" || type === "file" || type === "multiple_images") return "file";
  if (type === "select_dropdown" || type === "radio_btn" || type === "relationship") return "select";
  return "text";
}

const AGENT_CANDIDATE_ADD = new Set([
  "code", "name", "nationality", "blood_group", "status", "class_group_id", "agent_id", "sub_agent_id",
  "father_name", "mother_name", "gender", "dob", "bid", "nid", "passport_no", "passport_issue_date", "passport_expire_date",
  "nid_file_path", "passport_file_path", "cv_file_path", "present_address_house", "permanent_address_house",
  "full_photo_file_path", "half_photo_file_path", "basic_info_career", "basic_info_special", "other_skills", "agencier_id", "companier_id",
  "remarks", "email", "secondary_email", "mobile", "secondary_mobile", "emergency_mobile",
]);

const AGENT_REQUIRED = new Set(["name", "passport_no", "email", "mobile"]);

export function shapeAgentCandidateForm(fields: FormField[]): FormField[] {
  const matched = fields
    .filter((field) => AGENT_CANDIDATE_ADD.has(field.name))
    .map((field) => ({ ...field, required: AGENT_REQUIRED.has(field.name) }));
  const covered = new Set(matched.filter((field) => field.input === "select").map((field) => field.name));
  const kept = matched.filter((field) => field.input === "select" || !covered.has(field.name));
  kept.push(
    { name: "password", label: "Password", input: "password", required: false, multiple: false, options: [], value: "" },
    { name: "password_confirmation", label: "Re-Password", input: "password", required: false, multiple: false, options: [], value: "" },
  );
  return kept;
}

async function relatedChoices(
  table: string,
  label: string | undefined,
  selected: string,
  restrict?: { column: "id" | "agent_id"; value: number },
  knownColumns?: Set<string>,
): Promise<FormChoice[]> {
  const columns = knownColumns ?? (await columnSet(table));
  const fancy = (label === "agent_details_info" || label === "teacher_info" || label === "candidate_details_info" || label === "group_info" || label === "sub_agent_details_info") && columns.has("code") && columns.has("name");
  const labelColumn = label && columns.has(label) ? label : ["name", "title", "display_name", "full_name", "code"].find((column) => columns.has(column));
  const labelSql = fancy
    ? `trim(both ' ' FROM concat_ws(' ', CASE WHEN code IS NULL OR btrim(code::text) = '' THEN NULL ELSE '(' || code::text || ')' END, name::text))`
    : labelColumn
      ? `${quoteIdent(labelColumn)}::text`
      : "id::text";
  const where = restrict ? `WHERE ${quoteIdent(restrict.column)} = $1` : "";
  const rows = await pool.query(
    `SELECT id::text AS value, COALESCE(${labelSql}::text, id::text) AS label FROM ${quoteIdent(table)} ${where} ORDER BY 2 NULLS LAST LIMIT 500`,
    restrict ? [restrict.value] : [],
  );
  const options = (rows.rows as FormChoice[]).map((row) => ({ value: row.value, label: row.label }));
  if (selected && !options.some((option) => option.value === selected)) options.unshift({ value: selected, label: selected });
  return options;
}

function shiftPlaceholders(sql: string, offset: number): string {
  return sql.replace(/\$(\d+)/g, (_match, number: string) => `$${offset + Number(number)}`);
}

export async function loadBreadForm(slug: string, mode: "add" | "edit", id: number | null, viewer?: AccessUser | null): Promise<{ title: string; slug: string; fields: FormField[] } | null> {
  if (isSettingsSlug(slug)) {
    if (mode !== "edit" || id == null || !viewer) return null;
    const { loadSettingForm } = await import("@/server/settings");
    return loadSettingForm(viewer, id);
  }
  const type = await typeOf(slug);
  if (!type) return null;
  const flag = mode === "add" ? "add" : "edit";
  const fieldRows = type.synthetic
    ? type.table === "invoice_money_receipts"
      ? moneyReceiptFieldRows(flag)
      : type.table === "sub_agent_payment_requests"
        ? subAgentPaymentRequestFieldRows(flag)
        : type.table === "class_schedules"
          ? classScheduleFieldRows(flag)
          : type.table === "euro_to_bdt_rates"
            ? euroToBdtRateFieldRows(flag)
            : type.table === "currencies"
              ? currencyFieldRows(flag)
              : type.table === "ticket_invoice_money_receipts"
                ? ticketInvoiceMoneyReceiptFieldRows(flag)
                : arcFieldRows(flag)
    : ((
        await pool.query(
          `SELECT field, type, display_name, required, details FROM data_rows WHERE data_type_id = $1 AND ${flag} = 1 ORDER BY "order", id`,
          [type.id],
        )
      ).rows as FieldRow[]);
  const catalog = await loadColumnCatalog(formMetadataTables(type.table, fieldRows));
  const columns = catalog.get(type.table) ?? new Map<string, string>();
  let current: Record<string, string> = {};
  if (id != null) {
    if (!viewer) return null;
    const names = [...columns.keys()].filter((name) => IDENT.test(name));
    const resource = scopeFor(type.table, new Set(columns.keys()));
    const params: unknown[] = [id];
    const visibility = visibilitySql(resource, viewer, params);
    const selected = await pool.query(
      `SELECT ${names.map((name) => `${quoteIdent(name)}::text AS ${quoteIdent(name)}`).join(", ")}
       FROM ${quoteIdent(type.table)}
       WHERE id = $1 AND id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${visibility})`,
      params,
    );
    const row = selected.rows[0] as Record<string, string> | undefined;
    if (!row) return null;
    current = row;
  }
  const parentAgent = viewer?.roleName === "Sub Agent" && viewer.subAgentId != null
    ? await pool.query(`SELECT agent_id FROM sub_agents WHERE id = $1`, [viewer.subAgentId])
    : null;
  const parentAgentId = Number((parentAgent?.rows[0] as { agent_id?: number } | undefined)?.agent_id) || null;
  const fields: FormField[] = [];
  for (const row of fieldRows) {
    if (row.type === "hidden") continue;
    const details = detailsOf(row.details);
    if (row.type === "relationship") {
      const related = safe(details.table);
      const column = safe(details.column);
      if (!related || details.type !== "belongsTo" || !column || !columns.has(column)) continue;
      const value = (current[column] ?? "").trim();
      let restrict: { column: "id" | "agent_id"; value: number } | undefined;
      if (viewer?.roleName === "Agent" && viewer.agentId != null) {
        if (column === "agent_id") restrict = { column: "id", value: viewer.agentId };
        else if (column === "sub_agent_id") restrict = { column: "agent_id", value: viewer.agentId };
      }
      if (viewer?.roleName === "Sub Agent" && viewer.subAgentId != null) {
        if (column === "sub_agent_id") restrict = { column: "id", value: viewer.subAgentId };
        else if (column === "agent_id" && parentAgentId != null) restrict = { column: "id", value: parentAgentId };
      }
      fields.push({
        name: column,
        label: row.display_name,
        input: "select",
        required: row.required === 1,
        multiple: false,
        options: await relatedChoices(related, details.label, value, restrict, columnNames(catalog, related)),
        value,
      });
      continue;
    }
    const column = safe(row.field);
    if (!column || !columns.has(column)) continue;
    const input = column.endsWith("_file_path") ? "file" : inputFor(row.type);
    let value = id == null ? String(details.default ?? "") : (current[column] ?? "");
    value = value.trim();
    if (input === "date" && value.length >= 10) value = value.slice(0, 10);
    if (input === "time") value = value.length >= 16 ? value.slice(11, 16) : value.slice(0, 5);
    fields.push({
      name: column,
      label: row.display_name,
      input,
      required: row.required === 1,
      multiple: false,
      options: input === "select" ? choices(details) : [],
      value,
    });
  }
  if (type.table === "candidates" && columns.has("replaced_by_candidate_id") && !fields.some((field) => field.name === "replaced_by_candidate_id")) {
    const value = (current.replaced_by_candidate_id ?? "").trim();
    fields.push({
      name: "replaced_by_candidate_id",
      label: "Replaced By",
      input: "select",
      required: false,
      multiple: false,
      options: await relatedChoices("candidates", "candidate_details_info", value, undefined, new Set(columns.keys())),
      value,
    });
  }
  const editable = type.table === "candidates" && mode === "edit" ? fields.filter((field) => !isCredentialField(field)) : fields;
  return { title: type.title, slug: type.slug, fields: type.table === "users" ? dropDuplicateUserRoleText(editable) : editable };
}

function coerce(value: string, dataType: string, input: FormField["input"]): string | number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (input === "checkbox") return trimmed === "1" || trimmed === "on" || trimmed === "true" ? 1 : 0;
  if (dataType === "integer" || dataType === "bigint" || dataType === "smallint") {
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) throw new Error("Enter a whole number.");
    return parsed;
  }
  if (dataType === "numeric" || dataType === "double precision" || dataType === "real") {
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error("Enter a number.");
    return trimmed;
  }
  return trimmed;
}

async function assertCandidateVisible(user: AccessUser, candidateId: number): Promise<void> {
  if (!Number.isInteger(candidateId) || candidateId <= 0) throw new Error("You cannot use this candidate.");
  const resource = resolveResource("candidates");
  if (!resource) throw new Error("You cannot use this candidate.");
  const params: unknown[] = [candidateId];
  const visibility = visibilitySql(resource, user, params);
  const found = await pool.query(`SELECT 1 FROM candidates WHERE id = $1 AND ${visibility} LIMIT 1`, params);
  if ((found.rowCount ?? 0) === 0) throw new Error("You cannot use this candidate.");
}

async function linkCandidateLogin(candidateId: number, incoming: Record<string, string>, agentId: number | null, subAgentId: number | null): Promise<void> {
  const email = (incoming.email ?? "").trim().toLowerCase();
  const name = (incoming.name ?? "").trim();
  const password = (incoming.password ?? "").trim();
  if (!email || !name || !password) return;
  const role = await pool.query(`SELECT id FROM roles WHERE name = 'Candidate' LIMIT 1`);
  const roleId = (role.rows[0] as { id: number } | undefined)?.id ?? null;
  const hash = await hashPassword(password);
  try {
    const inserted = await pool.query(
      `INSERT INTO users (role_id, name, email, password, candidate_id, agent_id, sub_agent_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'A', NOW(), NOW()) RETURNING id`,
      [roleId, name, email, hash, candidateId, agentId, subAgentId],
    );
    const userId = Number(inserted.rows[0]?.id);
    if (roleId && userId) await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleId]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unique") || message.includes("users_email")) throw new Error("This email is already registered.");
    throw error;
  }
}

type StoredAssignment = { column: string; value: unknown; relationship: boolean };

function blankAssignment(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * One BREAD column can arrive as a raw field and again as a belongsTo relationship.
 * Both use the column name as the form key, so a normal submit has one posted value.
 * The relationship value replaces a raw value. A raw value does not replace a relationship value.
 * An empty duplicate does not clear a value already taken from the other row.
 * The first row is stored even when empty, so an optional field can still be cleared.
 */
export function mergeColumnAssignment(assignments: StoredAssignment[], column: string, value: unknown, relationship: boolean): void {
  const existing = assignments.find((item) => item.column === column);
  if (!existing) {
    assignments.push({ column, value, relationship });
    return;
  }
  if (blankAssignment(value)) return;
  if (blankAssignment(existing.value) || relationship || !existing.relationship) {
    existing.value = value;
    existing.relationship = existing.relationship || relationship;
  }
}

export async function saveBreadRecord(user: AccessUser, slug: string, id: number | null, incoming: Record<string, string>, ip: string | null): Promise<number> {
  if (isSettingsSlug(slug)) {
    if (id == null) throw new Error("You cannot add a setting.");
    const { saveSettingValue } = await import("@/server/settings");
    return saveSettingValue(user, id, incoming.value ?? "");
  }
  const type = await typeOf(slug);
  if (!type) throw new Error("Unknown module.");
  assertLegacySnapshotPreserved(type.table);
  const mode = id == null ? "add" : "edit";
  const panelAddingCandidate = false;
  const creatingCandidate = id == null && type.table === "candidates";
  const editingCandidate = mode === "edit" && type.table === "candidates";
  if (!canMutateTable(user, type.table, mode === "add" ? "add" : "edit")) throw new Error("You cannot save this record.");
  const password = (incoming.password ?? "").trim();
  const passwordConfirmation = (incoming.password_confirmation ?? "").trim();
  if (panelAddingCandidate && (password || passwordConfirmation) && password !== passwordConfirmation) {
    throw new Error("Re-Password does not match.");
  }
  const form = await loadBreadForm(slug, mode, id, user);
  if (!form) throw new Error(mode === "edit" ? "You cannot edit this record." : "This module has no form.");
  const types = await columnTypes(type.table);
  const columns = new Set(types.keys());
  const assignments: StoredAssignment[] = [];
  for (const field of form.fields) {
    if (panelAddingCandidate && !AGENT_CANDIDATE_ADD.has(field.name)) continue;
    if (editingCandidate && isCredentialField(field)) continue;
    if (!columns.has(field.name)) continue;
    if (creatingCandidate && field.name === "code") continue;
    const raw = incoming[field.name] ?? "";
    if (field.input === "password" || field.input === "file") {
      if (!raw) {
        if (field.required && id == null && field.input === "password") throw new Error(`${field.label} is required.`);
        continue;
      }
      mergeColumnAssignment(assignments, field.name, field.input === "password" ? await hashPassword(raw) : raw, false);
      continue;
    }
    const required = panelAddingCandidate ? AGENT_REQUIRED.has(field.name) : field.required;
    if (required && !raw.trim() && field.input !== "checkbox") throw new Error(`${field.label} is required.`);
    if (type.table === "sub_agent_payment_requests" && field.name === "amount") {
      const amountError = subAgentPaymentAmountError(raw);
      if (amountError) throw new Error(amountError);
    }
    mergeColumnAssignment(assignments, field.name, coerce(field.input === "checkbox" ? raw || "0" : raw, types.get(field.name) ?? "text", field.input), field.input === "select");
  }
  const scope = recordScope(user);
  if (scope.kind === "agent" && columns.has("agent_id")) {
    const found = assignments.find((item) => item.column === "agent_id");
    if (found) found.value = scope.agentId;
    else assignments.push({ column: "agent_id", value: scope.agentId, relationship: true });
  }
  if (scope.kind === "subAgent" && columns.has("sub_agent_id")) {
    const existing = assignments.find((item) => item.column === "sub_agent_id");
    if (existing) existing.value = scope.subAgentId;
    else assignments.push({ column: "sub_agent_id", value: scope.subAgentId, relationship: true });
    if (columns.has("agent_id")) {
      const parent = await pool.query(`SELECT agent_id FROM sub_agents WHERE id = $1`, [scope.subAgentId]);
      const parentAgentId = Number((parent.rows[0] as { agent_id?: number } | undefined)?.agent_id) || null;
      if (parentAgentId != null) {
        const agentField = assignments.find((item) => item.column === "agent_id");
        if (agentField) agentField.value = parentAgentId;
        else assignments.push({ column: "agent_id", value: parentAgentId, relationship: true });
      }
    }
  }
  if (id == null && type.table === "sub_agent_payment_requests" && columns.has("status") && !assignments.some((item) => item.column === "status")) {
    assignments.push({ column: "status", value: SUB_AGENT_PAYMENT_STATUS_DEFAULT, relationship: false });
  }
  const now = new Date();
  if (columns.has("updated_at") && !assignments.some((item) => item.column === "updated_at")) {
    assignments.push({ column: "updated_at", value: now, relationship: false });
  }
  if (id == null && columns.has("created_at") && !assignments.some((item) => item.column === "created_at")) {
    assignments.push({ column: "created_at", value: now, relationship: false });
  }
  for (const column of ["invoice_id", "ticket_invoice_id", "candidate_id", "exam_id"]) {
    if (!columns.has(column) || assignments.some((item) => item.column === column)) continue;
    const raw = (incoming[column] ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    assignments.push({ column, value: Number(raw), relationship: false });
  }
  const fileHashes = new Map<string, string>();
  for (const field of form.fields) {
    if (field.input !== "file") continue;
    const hash = (incoming[`__sha256_${field.name}`] ?? "").trim();
    if (hash) fileHashes.set(field.name, hash);
  }
  let paymentKey: string | null = null;
  if (type.table === "payments" && id == null && columns.has("idempotency_key")) {
    paymentKey = acceptedIdempotencyKey(incoming.idempotency_key) ?? newIdempotencyKey();
    const existingKey = assignments.find((item) => item.column === "idempotency_key");
    if (existingKey) existingKey.value = paymentKey;
    else assignments.push({ column: "idempotency_key", value: paymentKey, relationship: false });
  }
  const paymentFingerprint = paymentKey ? fingerprintAssigned(assignments, fileHashes) : "";
  const paymentColumns = assignments.map((item) => item.column);
  const paymentFiles = new Set(fileHashes.keys());
  const allocateCandidateCode = creatingCandidate && columns.has("code");
  const candidateAgentId = allocateCandidateCode ? assignedId(assignments, "agent_id") : null;
  if (allocateCandidateCode && candidateAgentId == null) throw new Error(CANDIDATE_CODE_AGENT_MESSAGE);
  if (assignments.length === 0) throw new Error("Nothing to save.");
  const candidateLink = assignments.find((item) => item.column === "candidate_id");
  if (candidateLink && candidateLink.value != null && candidateLink.value !== "") {
    const candidateId = typeof candidateLink.value === "number" ? candidateLink.value : Number(candidateLink.value);
    if (!Number.isInteger(candidateId)) throw new Error("You cannot use this candidate.");
    await assertCandidateVisible(user, candidateId);
  }
  const params = assignments.map((item) => item.value);
  const poolSql: SqlClient = {
    query: async (sql, values) => {
      const result = await pool.query(sql, values);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
  const persist = async (db: SqlClient): Promise<number> => {
    if (id == null) {
      const inserted = await db.query<{ id: number }>(
        `INSERT INTO ${quoteIdent(type.table)} (${assignments.map((item) => quoteIdent(item.column)).join(", ")})
         VALUES (${assignments.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
        params,
      );
      return Number(inserted.rows[0]?.id);
    }
    const resource = scopeFor(type.table, columns);
    const visibilityParams: unknown[] = [];
    const visibility = visibilitySql(resource, user, visibilityParams);
    params.push(id, ...visibilityParams);
    const idIndex = assignments.length + 1;
    const updated = await db.query(
      `UPDATE ${quoteIdent(type.table)} SET ${assignments.map((item, index) => `${quoteIdent(item.column)} = $${index + 1}`).join(", ")}
       WHERE id = $${idIndex} AND id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${shiftPlaceholders(visibility, idIndex)})`,
      params,
    );
    if ((updated.rowCount ?? 0) === 0) throw new Error("You cannot edit this record.");
    return id;
  };
  let recordCommitted = false;
  const passportField = type.table === "candidates" ? assignedPassportField(assignments) : null;
  try {
    const saved =
      type.table === "payments"
        ? await withPgTransaction(async (db) => {
            if (paymentKey) {
              const replayId = await heldPaymentId(db, user.id, paymentKey, paymentFingerprint, paymentColumns, paymentFiles);
              if (replayId != null) throw new IdempotentReplay(replayId);
            }
            const before = id == null ? null : await readPaymentFacts(db, id, true);
            const savedId = await persist(db);
            await syncPaymentChange(db, before, savedId);
            return savedId;
          })
        : allocateCandidateCode || (passportField && (id != null || passportField.passport))
          ? await withPgTransaction(async (db) => {
              if (passportField && (id != null || passportField.passport)) await retainPassportHistory(db, passportField.passport, id);
              if (allocateCandidateCode && candidateAgentId != null) await lockedAgentPrefix(db, candidateAgentId);
              const savedId = await persist(db);
              if (allocateCandidateCode && candidateAgentId != null) await assignLegacyCandidateCode(db, savedId, candidateAgentId);
              return savedId;
            })
          : await persist(poolSql);
    recordCommitted = true;
    if (id == null && panelAddingCandidate && password) await linkCandidateLogin(saved, incoming, user.agentId, user.subAgentId);
    await writeAudit({
      userId: user.id,
      action: id == null ? "create" : "update",
      entityType: type.table,
      entityId: String(saved),
      ip,
    });
    return saved;
  } catch (error) {
    if (error instanceof IdempotentReplay) throw error;
    if (paymentKey && isUniqueViolation(error)) {
      const replayId = await heldPaymentId(poolSql, user.id, paymentKey, paymentFingerprint, paymentColumns, paymentFiles);
      if (replayId != null) throw new IdempotentReplay(replayId);
      throw error;
    }
    if (recordCommitted) markRecordCommitted(error);
    throw error;
  }
}

function assignedId(assignments: StoredAssignment[], column: string): number | null {
  const found = assignments.find((item) => item.column === column);
  if (!found || found.value == null || found.value === "") return null;
  const parsed = typeof found.value === "number" ? found.value : Number(found.value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function ownerNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function heldPaymentId(
  db: SqlClient,
  userId: number,
  key: string,
  fingerprint: string,
  columns: string[],
  fileColumns: ReadonlySet<string>,
): Promise<number | null> {
  const held = await db.query<{ id: number; created_by: unknown; user_id: unknown }>(
    `SELECT id, created_by, user_id FROM payments WHERE idempotency_key = $1 FOR UPDATE`,
    [key],
  );
  const row = held.rows[0];
  if (!row) return null;
  if (!submissionOwnedBy({ createdBy: ownerNumber(row.created_by), userId: ownerNumber(row.user_id) }, userId)) {
    throw new IdempotencyConflictError();
  }
  const stored = await readStoredFingerprint(db, Number(row.id), columns, fileColumns);
  if (decideSubmission({ fingerprint: stored }, fingerprint) === "conflict") throw new IdempotencyConflictError();
  return Number(row.id);
}

const SLUG = /^[a-z0-9_-]{1,80}$/;

export function readBreadFormTarget(formData: FormData): { slug: string; id: number | null; stamp: boolean } {
  const slug = String(formData.get("slug") ?? "");
  const rawId = String(formData.get("id") ?? "");
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
  return { slug, id, stamp: String(formData.get("stamp") ?? "") === "Y" };
}

/** A submitted owner id is only a lookup key. Empty means a new record. Anything else is refused. */
export function parseUploadRecordId(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) throw new UploadDeniedError("You cannot edit this record.");
    return value;
  }
  if (typeof value !== "string") throw new UploadDeniedError("You cannot edit this record.");
  const raw = value.trim();
  if (!raw) return null;
  if (!/^[1-9]\d*$/.test(raw)) throw new UploadDeniedError("You cannot edit this record.");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new UploadDeniedError("You cannot edit this record.");
  return parsed;
}

async function assertRecordInScope(user: AccessUser, table: string, id: number): Promise<void> {
  const columns = await columnSet(table);
  const resource = scopeFor(table, columns);
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const found = await pool.query(
    `SELECT 1 FROM ${quoteIdent(table)} WHERE id = $1 AND id IN (SELECT id FROM ${quoteIdent(table)} WHERE ${visibility}) LIMIT 1`,
    params,
  );
  if ((found.rowCount ?? 0) === 0) throw new UploadDeniedError("You cannot edit this record.");
}

/**
 * Module permission and record scope for a save.
 * Call this before storeUpload. The record id is checked against the caller's scope.
 */
export async function assertCanSaveUpload(user: AccessUser, slug: string, id: number | null): Promise<{ slug: string; table: string }> {
  if (user.status && user.status !== "A") throw new UploadDeniedError("You cannot save this record.");
  const key = slug.trim();
  if (!SLUG.test(key)) throw new UploadDeniedError("Unknown module.");
  if (id != null && (!Number.isSafeInteger(id) || id <= 0)) throw new UploadDeniedError("You cannot edit this record.");
  const type = await typeOf(key);
  if (!type) throw new UploadDeniedError("Unknown module.");
  if (isLegacySnapshotTable(type.table)) {
    throw new UploadDeniedError("Historical agency and company snapshots cannot be changed or removed.");
  }
  const adding = id == null;
  if (!canMutateTable(user, type.table, adding ? "add" : "edit")) {
    throw new UploadDeniedError("You cannot save this record.");
  }
  if (id != null) await assertRecordInScope(user, type.table, id);
  return { slug: type.slug, table: type.table };
}

/** Authorize, store files, then save. A save that does not commit removes the new files. */
export async function submitBreadForm(user: AccessUser, formData: FormData, ip: string | null): Promise<number> {
  const { slug, id } = readBreadFormTarget(formData);
  const incoming: Record<string, string> = {};
  const files: Array<{ field: string; file: File }> = [];
  for (const [key, value] of formData.entries()) {
    if (key === "slug" || key === "id") continue;
    if (typeof value === "string") incoming[key] = value;
    else if (value instanceof File && value.size > 0) files.push({ field: key, file: value });
  }
  const storedIds: string[] = [];
  try {
    if (files.length > 0) {
      const target = await assertCanSaveUpload(user, slug, id);
      const ownerId = id == null ? undefined : String(id);
      for (const file of files) {
        const bytes = Buffer.from(await file.file.arrayBuffer());
        const stored = await storeUpload({
          bytes,
          originalName: file.file.name,
          declaredType: file.file.type,
          ownerTable: target.slug,
          ownerId,
          createdBy: user.id,
        });
        storedIds.push(stored.id);
        if (target.table === "payments") incoming[`__sha256_${file.field}`] = sha256Hex(bytes);
        incoming[file.field] = `/api/files/${stored.id}`;
      }
    }
    return await saveBreadRecord(user, slug, id, incoming, ip);
  } catch (error) {
    if (!recordWasCommitted(error)) await releaseStoredUploads(storedIds);
    if (error instanceof IdempotentReplay) return error.paymentId;
    throw error;
  }
}

export async function deleteBreadRecord(user: AccessUser, slug: string, id: number, ip: string | null): Promise<string> {
  if (isSettingsSlug(slug)) throw new Error("You cannot delete this setting.");
  const type = await typeOf(slug);
  if (!type) throw new Error("Unknown module.");
  assertLegacySnapshotPreserved(type.table);
  if (!canMutateTable(user, type.table, "delete")) throw new Error("You cannot delete this record.");
  const columns = await columnSet(type.table);
  const resource = scopeFor(type.table, columns);
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const where = `id = $1 AND id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${visibility})`;
  if (type.table === "payments") {
    await withPgTransaction(async (db) => {
      const before = await readPaymentFacts(db, id, true);
      const removed = await db.query<{ id: number }>(`DELETE FROM ${quoteIdent(type.table)} WHERE ${where} RETURNING id`, params);
      const count = removed.rows.length > 0 ? removed.rows.length : (removed.rowCount ?? 0);
      if (count === 0) throw new Error("You cannot delete this record.");
      await applyPaymentBalance(db, before, null);
    });
    await writeAudit({ userId: user.id, action: "delete", entityType: type.table, entityId: String(id), ip });
    return type.slug;
  }
  const result = columns.has("deleted_at")
    ? await pool.query(`UPDATE ${quoteIdent(type.table)} SET deleted_at = NOW() WHERE ${where} AND deleted_at IS NULL`, params)
    : await pool.query(`DELETE FROM ${quoteIdent(type.table)} WHERE ${where}`, params);
  if (result.rowCount === 0) throw new Error("You cannot delete this record.");
  await writeAudit({ userId: user.id, action: "delete", entityType: type.table, entityId: String(id), ip });
  return type.slug;
}
