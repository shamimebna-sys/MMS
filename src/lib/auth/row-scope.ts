import { canBrowseTable, recordScope, type AccessUser, type RecordScope } from "@/lib/auth/permissions";

const IDENT = /^[a-z_][a-z0-9_]*$/;

export type ScopeMode =
  | { mode: "reference" }
  | { mode: "own-user"; column: string }
  | {
      mode: "column";
      candidate?: string;
      agent?: string;
      subAgent?: string;
      agencier?: string;
      companier?: string;
    }
  | { mode: "payment" }
  | { mode: "invoice" }
  | { mode: "candidate-child"; column: string };

export type ScopedResource = {
  table: string;
  scope: ScopeMode;
};

export function quoteIdent(identifier: string): string {
  if (!IDENT.test(identifier)) throw new Error("Unsafe identifier.");
  return `"${identifier}"`;
}

function scopeValue(scope: RecordScope): number | null {
  if (scope.kind === "candidate") return scope.candidateId;
  if (scope.kind === "agent") return scope.agentId;
  if (scope.kind === "subAgent") return scope.subAgentId;
  if (scope.kind === "agencier") return scope.agencierId;
  if (scope.kind === "companier") return scope.companierId;
  return null;
}

/** Recruitment lookups. These rows are shared; they are not party-owned. */
const SHARED_REFERENCE_TABLES = new Set([
  "class_groups",
  "class_schedules",
  "countries",
  "currencies",
  "districts",
  "divisions",
  "document_types",
  "euro_to_bdt_rates",
  "exams",
  "live_status",
  "positions",
  "thanas",
  "ticket_companies",
  "upazilas",
]);

/** Staff directories. A party browse grant does not open every row. */
const OFFICE_DIRECTORY_TABLES = new Set(["employees", "employers", "roles", "teachers"]);

function partyBinding(scope: RecordScope): { column: string; value: number } | null {
  if (scope.kind === "agent") return { column: "agent_id", value: scope.agentId };
  if (scope.kind === "subAgent") return { column: "sub_agent_id", value: scope.subAgentId };
  if (scope.kind === "candidate") return { column: "candidate_id", value: scope.candidateId };
  if (scope.kind === "agencier") return { column: "agencier_id", value: scope.agencierId };
  if (scope.kind === "companier") return { column: "companier_id", value: scope.companierId };
  return null;
}

function referenceVisibility(resource: ScopedResource, user: AccessUser, scope: RecordScope, params: unknown[]): string {
  const table = resource.table;
  if (SHARED_REFERENCE_TABLES.has(table)) return "TRUE";
  if (table === "jobs") return "FALSE";
  if (table === "licenses") {
    if (scope.kind === "office" && canBrowseTable(user, table)) return "TRUE";
    if (scope.kind === "companier") {
      params.push(scope.companierId);
      return `${quoteIdent("companier_id")} = $${params.length}`;
    }
    return "FALSE";
  }
  if (table === "users") {
    if (scope.kind === "office" && canBrowseTable(user, table)) return "TRUE";
    const party = canBrowseTable(user, table) ? partyBinding(scope) : null;
    if (!party) {
      params.push(user.id);
      return `${quoteIdent("id")} = $${params.length}`;
    }
    params.push(party.value);
    const partyMarker = `$${params.length}`;
    params.push(user.id);
    return `(${quoteIdent(party.column)} = ${partyMarker} OR ${quoteIdent("id")} = $${params.length})`;
  }
  if (table === "audit_logs") {
    if (scope.kind === "office" && canBrowseTable(user, table)) return "TRUE";
    params.push(user.id);
    return `${quoteIdent("user_id")} = $${params.length}`;
  }
  if (OFFICE_DIRECTORY_TABLES.has(table)) {
    return scope.kind === "office" && canBrowseTable(user, table) ? "TRUE" : "FALSE";
  }
  return canBrowseTable(user, table) ? "TRUE" : "FALSE";
}

export function visibilitySql(resource: ScopedResource, user: AccessUser, params: unknown[]): string {
  const scope = recordScope(user);
  if (scope.kind === "none") return "FALSE";
  if (scope.kind === "all") return "TRUE";
  if (resource.scope.mode === "reference") return referenceVisibility(resource, user, scope, params);
  if (scope.kind === "office") {
    if (resource.scope.mode === "own-user") {
      params.push(user.id);
      return `${quoteIdent(resource.scope.column)} = $${params.length}`;
    }
    return "FALSE";
  }
  if (resource.table === "payment_requests" && scope.kind === "agent") {
    params.push(scope.agentId);
    return `(agent_id = $${params.length} OR candidate_id IN (SELECT id FROM candidates WHERE agent_id = $${params.length} AND deleted_at IS NULL))`;
  }
  if (resource.table === "sub_agent_payment_requests" && scope.kind === "agent") {
    params.push(scope.agentId);
    return `(sub_agent_id IN (SELECT id FROM sub_agents WHERE agent_id = $${params.length} AND deleted_at IS NULL) OR candidate_id IN (SELECT id FROM candidates WHERE agent_id = $${params.length} AND deleted_at IS NULL))`;
  }
  if (resource.scope.mode === "own-user") {
    params.push(user.id);
    return `${quoteIdent(resource.scope.column)} = $${params.length}`;
  }
  if (resource.scope.mode === "column") {
    const column =
      scope.kind === "candidate"
        ? resource.scope.candidate
        : scope.kind === "agent"
          ? resource.scope.agent
          : scope.kind === "subAgent"
            ? resource.scope.subAgent
            : scope.kind === "agencier"
              ? resource.scope.agencier
              : scope.kind === "companier"
                ? resource.scope.companier
                : undefined;
    const value = scopeValue(scope);
    if (!column || value == null) return "FALSE";
    params.push(value);
    return `${quoteIdent(column)} = $${params.length}`;
  }
  if (resource.scope.mode === "candidate-child") {
    const column = resource.scope.column;
    if (scope.kind === "candidate") {
      params.push(scope.candidateId);
      return `${quoteIdent(column)} = $${params.length}`;
    }
    const owner =
      scope.kind === "agent"
        ? "agent_id"
        : scope.kind === "subAgent"
          ? "sub_agent_id"
          : scope.kind === "agencier"
            ? "agencier_id"
            : scope.kind === "companier"
              ? "companier_id"
              : null;
    const value = scopeValue(scope);
    if (!owner || value == null) return "FALSE";
    params.push(value);
    return `${quoteIdent(column)} IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND ${quoteIdent(owner)} = $${params.length})`;
  }
  if (resource.scope.mode === "payment") {
    if (scope.kind === "candidate") {
      params.push(scope.candidateId);
      return `${quoteIdent("candidate_id")} = $${params.length}`;
    }
    if (scope.kind === "agent") {
      params.push(scope.agentId);
      return `${quoteIdent("sub_agent_id")} IN (SELECT id FROM sub_agents WHERE agent_id = $${params.length} AND deleted_at IS NULL)`;
    }
    if (scope.kind === "subAgent") {
      params.push(scope.subAgentId);
      return `${quoteIdent("sub_agent_id")} = $${params.length}`;
    }
    return "FALSE";
  }
  if (scope.kind === "agencier") {
    params.push(scope.agencierId);
    return `${quoteIdent("agenciers_id")} = $${params.length}`;
  }
  if (scope.kind === "companier") {
    params.push(scope.companierId);
    return `${quoteIdent("companier_id")} = $${params.length}`;
  }
  if (scope.kind === "candidate" || scope.kind === "agent" || scope.kind === "subAgent") {
    const column = scope.kind === "candidate" ? "id" : scope.kind === "agent" ? "agent_id" : "sub_agent_id";
    params.push(scopeValue(scope));
    const marker = `$${params.length}`;
    return `${quoteIdent("id")} IN (SELECT invoice_id FROM invoice_candidates ic JOIN candidates c ON c.id = ic.candidate_id WHERE c.${quoteIdent(column)} = ${marker} AND c.deleted_at IS NULL)`;
  }
  return "FALSE";
}

export function candidateFilterSql(user: AccessUser, params: unknown[]): string {
  const scope = recordScope(user);
  if (scope.kind === "none" || scope.kind === "office") return "FALSE";
  if (scope.kind === "all") return `"deleted_at" IS NULL`;
  if (scope.kind === "candidate") {
    params.push(scope.candidateId);
    return `"deleted_at" IS NULL AND "id" = $${params.length}`;
  }
  const column = scope.kind === "agent" ? "agent_id" : scope.kind === "subAgent" ? "sub_agent_id" : scope.kind === "agencier" ? "agencier_id" : "companier_id";
  params.push(scopeValue(scope));
  return `"deleted_at" IS NULL AND ${quoteIdent(column)} = $${params.length}`;
}
