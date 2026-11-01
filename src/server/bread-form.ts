import { canMutateTable, recordScope, type AccessUser } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { pool } from "@/lib/db";
import { writeAudit } from "@/server/audit";
import { quoteIdent, resolveResource, visibilitySql, type ResourceDef, type ScopeMode } from "@/server/resources";

const IDENT = /^[a-z_][a-z0-9_]*$/;

export type FormChoice = { value: string; label: string };

export type FormField = {
  name: string;
  label: string;
  input: "text" | "textarea" | "number" | "date" | "time" | "email" | "password" | "checkbox" | "select" | "file" | "hidden";
  required: boolean;
  multiple: boolean;
  options: FormChoice[];
  value: string;
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

function scopeFor(table: string, columns: Set<string>): ResourceDef {
  const existing = resolveResource(table) ?? resolveResource(table.replace(/_/g, "-"));
  if (existing) return existing;
  let scope: ScopeMode = { mode: "reference" };
  if (table === "sub_agents" && columns.has("agent_id")) {
    scope = { mode: "column", candidate: "id", agent: "agent_id", subAgent: "id", agencier: "agent_id", companier: "agent_id" };
  } else if (columns.has("candidate_id")) scope = { mode: "candidate-child", column: "candidate_id" };
  return { slug: table, table, title: table, group: "", columns: ["id"], search: [], softDelete: columns.has("deleted_at"), scope };
}

async function typeOf(slug: string): Promise<{ id: number; slug: string; table: string; title: string } | null> {
  const result = await pool.query(
    `SELECT id, slug, name, display_name_singular FROM data_types
     WHERE slug = $1 OR name = $1 OR slug = replace($1, '_', '-') OR name = replace($1, '-', '_')
     LIMIT 1`,
    [slug],
  );
  const row = result.rows[0] as { id: number; slug: string; name: string; display_name_singular: string } | undefined;
  if (!row) return null;
  return { id: row.id, slug: row.slug, table: row.name, title: row.display_name_singular };
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

async function relatedChoices(table: string, label: string | undefined, selected: string, restrict?: { column: "id" | "agent_id"; value: number }): Promise<FormChoice[]> {
  const columns = await columnSet(table);
  const fancy = (label === "agent_details_info" || label === "teacher_info" || label === "candidate_details_info" || label === "group_info") && columns.has("code") && columns.has("name");
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
  const type = await typeOf(slug);
  if (!type) return null;
  const flag = mode === "add" ? "add" : "edit";
  const rows = await pool.query(
    `SELECT field, type, display_name, required, details FROM data_rows WHERE data_type_id = $1 AND ${flag} = 1 ORDER BY "order", id`,
    [type.id],
  );
  const columns = await columnTypes(type.table);
  let current: Record<string, string> = {};
  if (id != null) {
    const names = [...columns.keys()].filter((name) => IDENT.test(name));
    const selected = await pool.query(`SELECT ${names.map((name) => `${quoteIdent(name)}::text AS ${quoteIdent(name)}`).join(", ")} FROM ${quoteIdent(type.table)} WHERE id = $1`, [id]);
    current = (selected.rows[0] as Record<string, string> | undefined) ?? {};
  }
  const parentAgent = viewer?.roleName === "Sub Agent" && viewer.subAgentId != null
    ? await pool.query(`SELECT agent_id FROM sub_agents WHERE id = $1`, [viewer.subAgentId])
    : null;
  const parentAgentId = Number((parentAgent?.rows[0] as { agent_id?: number } | undefined)?.agent_id) || null;
  const fields: FormField[] = [];
  for (const row of rows.rows as FieldRow[]) {
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
        options: await relatedChoices(related, details.label, value, restrict),
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
  if (type.table === "candidates" && mode === "edit" && columns.has("replaced_by_candidate_id") && !fields.some((field) => field.name === "replaced_by_candidate_id")) {
    const value = (current.replaced_by_candidate_id ?? "").trim();
    fields.push({
      name: "replaced_by_candidate_id",
      label: "Replaced By",
      input: "select",
      required: false,
      multiple: false,
      options: await relatedChoices("candidates", "candidate_details_info", value),
      value,
    });
  }
  if (type.table === "candidates" && mode === "edit") {
    fields.push(
      { name: "password", label: "Password", input: "password", required: false, multiple: false, options: [], value: "" },
      { name: "password_confirmation", label: "Re-Password", input: "password", required: false, multiple: false, options: [], value: "" },
    );
  }
  return { title: type.title, slug: type.slug, fields };
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

export async function saveBreadRecord(user: AccessUser, slug: string, id: number | null, incoming: Record<string, string>, ip: string | null): Promise<number> {
  const type = await typeOf(slug);
  if (!type) throw new Error("Unknown module.");
  const mode = id == null ? "add" : "edit";
  const panelAddingCandidate = mode === "add" && type.table === "candidates" && ((user.roleName === "Agent" && user.agentId != null) || (user.roleName === "Sub Agent" && user.subAgentId != null));
  if (!canMutateTable(user, type.table, mode === "add" ? "add" : "edit") && !panelAddingCandidate) throw new Error("You cannot save this record.");
  const password = (incoming.password ?? "").trim();
  const passwordConfirmation = (incoming.password_confirmation ?? "").trim();
  if ((panelAddingCandidate || (mode === "edit" && type.table === "candidates")) && (password || passwordConfirmation) && password !== passwordConfirmation) {
    throw new Error("Re-Password does not match.");
  }
  const form = await loadBreadForm(slug, mode, id);
  if (!form) throw new Error("This module has no form.");
  const types = await columnTypes(type.table);
  const columns = new Set(types.keys());
  const assignments: Array<{ column: string; value: unknown }> = [];
  for (const field of form.fields) {
    if (panelAddingCandidate && !AGENT_CANDIDATE_ADD.has(field.name)) continue;
    if (!columns.has(field.name)) continue;
    const raw = incoming[field.name] ?? "";
    if (field.input === "password" || field.input === "file") {
      if (!raw) {
        if (field.required && id == null && field.input === "password") throw new Error(`${field.label} is required.`);
        continue;
      }
      assignments.push({ column: field.name, value: field.input === "password" ? await hashPassword(raw) : raw });
      continue;
    }
    const required = panelAddingCandidate ? AGENT_REQUIRED.has(field.name) : field.required;
    if (required && !raw.trim() && field.input !== "checkbox") throw new Error(`${field.label} is required.`);
    assignments.push({ column: field.name, value: coerce(field.input === "checkbox" ? raw || "0" : raw, types.get(field.name) ?? "text", field.input) });
  }
  const scope = recordScope(user);
  if (scope.kind === "agent" && columns.has("agent_id")) {
    const found = assignments.find((item) => item.column === "agent_id");
    if (found) found.value = scope.agentId;
    else assignments.push({ column: "agent_id", value: scope.agentId });
  }
  if (scope.kind === "subAgent" && columns.has("sub_agent_id")) {
    const existing = assignments.find((item) => item.column === "sub_agent_id");
    if (existing) existing.value = scope.subAgentId;
    else assignments.push({ column: "sub_agent_id", value: scope.subAgentId });
    if (columns.has("agent_id")) {
      const parent = await pool.query(`SELECT agent_id FROM sub_agents WHERE id = $1`, [scope.subAgentId]);
      const parentAgentId = Number((parent.rows[0] as { agent_id?: number } | undefined)?.agent_id) || null;
      if (parentAgentId != null) {
        const agentField = assignments.find((item) => item.column === "agent_id");
        if (agentField) agentField.value = parentAgentId;
        else assignments.push({ column: "agent_id", value: parentAgentId });
      }
    }
  }
  const now = new Date();
  if (columns.has("updated_at") && !assignments.some((item) => item.column === "updated_at")) assignments.push({ column: "updated_at", value: now });
  if (id == null && columns.has("created_at") && !assignments.some((item) => item.column === "created_at")) {
    assignments.push({ column: "created_at", value: now });
  }
  for (const column of ["invoice_id", "candidate_id", "exam_id"]) {
    if (!columns.has(column) || assignments.some((item) => item.column === column)) continue;
    const raw = (incoming[column] ?? "").trim();
    if (!/^\d+$/.test(raw)) continue;
    assignments.push({ column, value: Number(raw) });
  }
  if (assignments.length === 0) throw new Error("Nothing to save.");
  const params = assignments.map((item) => item.value);
  if (id == null) {
    const inserted = await pool.query(
      `INSERT INTO ${quoteIdent(type.table)} (${assignments.map((item) => quoteIdent(item.column)).join(", ")})
       VALUES (${assignments.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
      params,
    );
    const created = Number(inserted.rows[0]?.id);
    if (panelAddingCandidate && password) await linkCandidateLogin(created, incoming, user.agentId, user.subAgentId);
    await writeAudit({ userId: user.id, action: "create", entityType: type.table, entityId: String(created), ip });
    return created;
  }
  const resource = scopeFor(type.table, columns);
  const visibilityParams: unknown[] = [];
  const visibility = visibilitySql(resource, user, visibilityParams);
  params.push(id, ...visibilityParams);
  const idIndex = assignments.length + 1;
  const updated = await pool.query(
    `UPDATE ${quoteIdent(type.table)} SET ${assignments.map((item, index) => `${quoteIdent(item.column)} = $${index + 1}`).join(", ")}
     WHERE id = $${idIndex} AND id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${shiftPlaceholders(visibility, idIndex)})`,
    params,
  );
  if (updated.rowCount === 0) throw new Error("You cannot edit this record.");
  if (type.table === "candidates" && password) {
    const hashed = await hashPassword(password);
    const changed = await pool.query(`UPDATE users SET password = $1, updated_at = NOW() WHERE candidate_id = $2`, [hashed, id]);
    if (changed.rowCount === 0) await linkCandidateLogin(id, incoming, user.agentId, user.subAgentId);
  }
  await writeAudit({ userId: user.id, action: "update", entityType: type.table, entityId: String(id), ip });
  return id;
}

export async function deleteBreadRecord(user: AccessUser, slug: string, id: number, ip: string | null): Promise<string> {
  const type = await typeOf(slug);
  if (!type) throw new Error("Unknown module.");
  if (!canMutateTable(user, type.table, "delete")) throw new Error("You cannot delete this record.");
  const columns = await columnSet(type.table);
  const resource = scopeFor(type.table, columns);
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const where = `id = $1 AND id IN (SELECT id FROM ${quoteIdent(type.table)} WHERE ${visibility})`;
  const result = columns.has("deleted_at")
    ? await pool.query(`UPDATE ${quoteIdent(type.table)} SET deleted_at = NOW() WHERE ${where} AND deleted_at IS NULL`, params)
    : await pool.query(`DELETE FROM ${quoteIdent(type.table)} WHERE ${where}`, params);
  if (result.rowCount === 0) throw new Error("You cannot delete this record.");
  await writeAudit({ userId: user.id, action: "delete", entityType: type.table, entityId: String(id), ip });
  return type.slug;
}
