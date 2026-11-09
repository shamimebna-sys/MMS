import type { SqlClient } from "@/lib/payment-ledger";

/**
 * Historical candidate codes in docs/db.txt.
 * 1,876 candidates all have an agent. 1,509 equal trim(agents.code) plus the candidate id,
 * padded to 4 digits for ids 1–4405 and 6 digits from id 4406 upward.
 * Id 4406 is stored as 101004406. Later matches, including 4802, 4820, and 4823, use 6 digits.
 * The other 367 rows do not match the current agent: 153 match a different agent's code plus the same padding,
 * and the rest are older suffixes, the bare id, or values with no party-code rule.
 * Agent codes in the dump are unique 3- or 4-digit numbers. One code has a trailing space.
 * The suffix is the new candidate id. The generator does not read the highest stored code,
 * and it does not invent a prefix when the agent code is missing.
 */
export const LEGACY_CANDIDATE_CODE_WIDE_FROM = 4406;

export const CANDIDATE_CODE_AGENT_MESSAGE = "A candidate code cannot be generated without an agent.";
export const CANDIDATE_CODE_PREFIX_MESSAGE = "This agent has no numeric code, so a candidate code cannot be generated.";
export const CANDIDATE_CODE_WIDTH_MESSAGE = "This candidate id does not fit the historical code width.";
export const CANDIDATE_CODE_TAKEN_MESSAGE = "That candidate code is already used.";

export function legacyCandidateCodeWidth(candidateId: number): 4 | 6 | null {
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) return null;
  const width = candidateId < LEGACY_CANDIDATE_CODE_WIDE_FROM ? 4 : 6;
  if (String(candidateId).length > width) return null;
  return width;
}

export function legacyCandidateCode(agentCode: string, candidateId: number): string {
  const prefix = agentCode.trim();
  if (!/^\d+$/.test(prefix)) throw new Error(CANDIDATE_CODE_PREFIX_MESSAGE);
  const width = legacyCandidateCodeWidth(candidateId);
  if (width == null) throw new Error(candidateId > 0 ? CANDIDATE_CODE_WIDTH_MESSAGE : CANDIDATE_CODE_AGENT_MESSAGE);
  return `${prefix}${String(candidateId).padStart(width, "0")}`;
}

export async function lockedAgentPrefix(db: SqlClient, agentId: number): Promise<string> {
  if (!Number.isSafeInteger(agentId) || agentId <= 0) throw new Error(CANDIDATE_CODE_AGENT_MESSAGE);
  const locked = await db.query<{ code: string | null }>(
    `SELECT btrim(code) AS code FROM agents WHERE id = $1 FOR UPDATE`,
    [agentId],
  );
  const agentCode = locked.rows[0]?.code;
  if (locked.rows.length === 0 || agentCode == null) throw new Error(CANDIDATE_CODE_AGENT_MESSAGE);
  const prefix = agentCode.trim();
  if (!/^\d+$/.test(prefix)) throw new Error(CANDIDATE_CODE_PREFIX_MESSAGE);
  return prefix;
}

export async function assignLegacyCandidateCode(db: SqlClient, candidateId: number, agentId: number): Promise<string> {
  const prefix = await lockedAgentPrefix(db, agentId);
  const code = legacyCandidateCode(prefix, candidateId);
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))::text AS locked`, [code]);
  const taken = await db.query<{ id: number }>(
    `SELECT id FROM candidates WHERE btrim(code::text) = $1 AND id <> $2 LIMIT 1`,
    [code, candidateId],
  );
  if (taken.rows[0]) throw new Error(CANDIDATE_CODE_TAKEN_MESSAGE);
  const updated = await db.query<{ id: number }>(`UPDATE candidates SET code = $1 WHERE id = $2 RETURNING id`, [code, candidateId]);
  if (updated.rows.length !== 1) throw new Error(CANDIDATE_CODE_TAKEN_MESSAGE);
  return code;
}
