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
};

const FULL_ACCESS_ROLES = new Set(["sadmin", "owner"]);

export function hasFullAccess(user: AccessUser): boolean {
  return user.roleName != null && FULL_ACCESS_ROLES.has(user.roleName);
}

export function hasPermission(user: AccessUser, key: string): boolean {
  if (user.status && user.status !== "A") return false;
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
  return hasPermission(user, `${action}_${table}`);
}

export type RecordScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "candidate"; candidateId: number }
  | { kind: "agent"; agentId: number }
  | { kind: "subAgent"; subAgentId: number }
  | { kind: "agencier"; agencierId: number }
  | { kind: "companier"; companierId: number };

/** Row visibility. Navigation hiding is not authorization; queries must use this scope. */
export function recordScope(user: AccessUser): RecordScope {
  if (user.status && user.status !== "A") return { kind: "none" };
  if (hasFullAccess(user)) return { kind: "all" };
  if (user.roleName === "Candidate" && user.candidateId) return { kind: "candidate", candidateId: user.candidateId };
  if (user.roleName === "Agent" && user.agentId) return { kind: "agent", agentId: user.agentId };
  if (user.roleName === "Sub Agent" && user.subAgentId) return { kind: "subAgent", subAgentId: user.subAgentId };
  if ((user.roleName === "Agency" || user.roleName === "Agencier") && user.agencierId) {
    return { kind: "agencier", agencierId: user.agencierId };
  }
  if (user.roleName === "Company" && user.companierId) return { kind: "companier", companierId: user.companierId };
  if (user.candidateId) return { kind: "candidate", candidateId: user.candidateId };
  if (canBrowseTable(user, "candidates")) return { kind: "all" };
  return { kind: "none" };
}
