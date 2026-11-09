import { hasFullAccess, recordScope, type AccessUser } from "@/lib/auth/permissions";

export type WalletLedgerScope =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "agent"; agentId: number }
  | { kind: "subAgent"; subAgentId: number }
  | { kind: "candidate"; candidateId: number }
  | { kind: "agencier"; agencierId: number }
  | { kind: "companier"; companierId: number };

/**
 * Wallet rows follow the signed-in account.
 * An agent or sub-agent sees that party's ledger.
 * sadmin, admin, and owner, with no party id, see every payment.
 * Every other account sees none of the global ledger.
 */
export function walletLedgerScope(user: AccessUser): WalletLedgerScope {
  if (user.status && user.status !== "A") return { kind: "none" };
  if (user.agentId != null) return { kind: "agent", agentId: user.agentId };
  if (user.subAgentId != null) return { kind: "subAgent", subAgentId: user.subAgentId };
  if (hasFullAccess(user)) return { kind: "all" };
  const scope = recordScope(user);
  if (scope.kind === "candidate") return { kind: "candidate", candidateId: scope.candidateId };
  if (scope.kind === "agencier") return { kind: "agencier", agencierId: scope.agencierId };
  if (scope.kind === "companier") return { kind: "companier", companierId: scope.companierId };
  if (scope.kind === "agent") return { kind: "agent", agentId: scope.agentId };
  if (scope.kind === "subAgent") return { kind: "subAgent", subAgentId: scope.subAgentId };
  return { kind: "none" };
}

export function walletPaymentWhere(scope: WalletLedgerScope, params: unknown[]): string {
  if (scope.kind === "all") return "p.id IS NOT NULL";
  if (scope.kind === "agent") {
    params.push(scope.agentId);
    return `p.agent_id = $${params.length}`;
  }
  if (scope.kind === "subAgent") {
    params.push(scope.subAgentId);
    return `p.sub_agent_id = $${params.length}`;
  }
  if (scope.kind === "candidate") {
    params.push(scope.candidateId);
    return `p.candidate_id = $${params.length}`;
  }
  if (scope.kind === "agencier") {
    params.push(scope.agencierId);
    return `p.candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND agencier_id = $${params.length})`;
  }
  if (scope.kind === "companier") {
    params.push(scope.companierId);
    return `p.candidate_id IN (SELECT id FROM candidates WHERE deleted_at IS NULL AND companier_id = $${params.length})`;
  }
  return "FALSE";
}

export function walletBalanceSql(scope: WalletLedgerScope): { sql: string; params: unknown[] } {
  if (scope.kind === "agent") {
    return { sql: `SELECT COALESCE(balance, 0)::text AS balance FROM agents WHERE id = $1`, params: [scope.agentId] };
  }
  if (scope.kind === "subAgent") {
    return { sql: `SELECT COALESCE(balance, 0)::text AS balance FROM sub_agents WHERE id = $1`, params: [scope.subAgentId] };
  }
  if (scope.kind === "candidate") {
    return { sql: `SELECT COALESCE(balance, 0)::text AS balance FROM candidates WHERE id = $1`, params: [scope.candidateId] };
  }
  if (scope.kind === "all") {
    return { sql: `SELECT COALESCE(SUM(balance), 0)::text AS balance FROM agents WHERE deleted_at IS NULL`, params: [] };
  }
  return { sql: `SELECT 0::text AS balance`, params: [] };
}
