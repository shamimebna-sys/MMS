export type AccessUser = {
  id: number;
  name: string;
  roleName: string | null;
  permissions: string[];
  agentId: number | null;
  subAgentId: number | null;
  candidateId: number | null;
  agencierId: number | null;
  companierId: number | null;
  status: string | null;
  /** Presentation only. Authorization keeps using roleName, permissions, and party ids. */
  email?: string | null;
  avatar?: string | null;
  roleDisplayName?: string | null;
};

/** sadmin, admin, and owner see every candidate. Candidate create, edit, approve, and delete follow the approved action matrix. Menu entry stays on hasGrant. */
const FULL_ACCESS_ROLES = new Set(["sadmin", "admin", "owner"]);

const CANDIDATE_ACTION_KEYS: Record<string, CandidateAction> = {
  add_candidates: "add",
  edit_candidates: "edit",
  delete_candidates: "delete",
  approve_candidates: "approve",
};

export type CandidateAction = "add" | "edit" | "delete" | "approve";

export function hasFullAccess(user: AccessUser): boolean {
  return user.roleName != null && FULL_ACCESS_ROLES.has(user.roleName);
}

function roleIsActive(user: AccessUser): boolean {
  return !user.status || user.status === "A";
}

/**
 * Approved candidate action matrix. Visibility is separate.
 * sadmin, admin, and owner may create, edit, and approve. Nobody may delete.
 * A stored grant cannot widen that matrix.
 */
export function canCandidateAction(user: AccessUser, action: CandidateAction): boolean {
  if (!roleIsActive(user) || !hasFullAccess(user)) return false;
  return action === "add" || action === "edit" || action === "approve";
}

export function hasPermission(user: AccessUser, key: string): boolean {
  if (!roleIsActive(user)) return false;
  const candidateAction = CANDIDATE_ACTION_KEYS[key];
  if (candidateAction) return canCandidateAction(user, candidateAction);
  if (hasFullAccess(user)) return true;
  return user.permissions.includes(key);
}

/** Menu visibility follows the stored grant. Full-access roles still only show items their role was given. */
export function hasGrant(user: AccessUser, key: string): boolean {
  if (user.status && user.status !== "A") return false;
  return user.permissions.includes(key);
}

export function canBrowseTable(user: AccessUser, table: string): boolean {
  return hasPermission(user, `browse_${table}`);
}

export function canMutateTable(user: AccessUser, table: string, action: "add" | "edit" | "delete"): boolean {
  if (table === "candidates") return canCandidateAction(user, action);
  return hasPermission(user, `${action}_${table}`);
}

export type RecordScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "office" }
  | { kind: "candidate"; candidateId: number }
  | { kind: "agent"; agentId: number }
  | { kind: "subAgent"; subAgentId: number }
  | { kind: "agencier"; agencierId: number }
  | { kind: "companier"; companierId: number };

/** Row visibility. Navigation hiding is not authorization; queries must use this scope. */
export function recordScope(user: AccessUser): RecordScope {
  if (user.status && user.status !== "A") return { kind: "none" };
  if (hasFullAccess(user)) return { kind: "all" };
  if (user.roleName === "Candidate") {
    return user.candidateId ? { kind: "candidate", candidateId: user.candidateId } : { kind: "none" };
  }
  if (user.roleName === "Agent") {
    return user.agentId ? { kind: "agent", agentId: user.agentId } : { kind: "none" };
  }
  if (user.roleName === "Sub Agent") {
    return user.subAgentId ? { kind: "subAgent", subAgentId: user.subAgentId } : { kind: "none" };
  }
  if (user.roleName === "Agency" || user.roleName === "Agencier") {
    return user.agencierId ? { kind: "agencier", agencierId: user.agencierId } : { kind: "none" };
  }
  if (user.roleName === "Company" || user.roleName === "Companier") {
    return user.companierId ? { kind: "companier", companierId: user.companierId } : { kind: "none" };
  }
  // Employer visibility is not an A07 decision. Keep the previous candidate-link behavior for that role only.
  if (user.roleName === "Employer") {
    if (user.candidateId) return { kind: "candidate", candidateId: user.candidateId };
    if (canBrowseTable(user, "candidates")) return { kind: "office" };
    return { kind: "none" };
  }
  if (user.roleName === "Employee" || user.roleName === "Teacher") {
    return canBrowseTable(user, "candidates") ? { kind: "office" } : { kind: "none" };
  }
  if (canBrowseTable(user, "candidates")) return { kind: "office" };
  return { kind: "none" };
}
