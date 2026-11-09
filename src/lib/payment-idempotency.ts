import { createHash, randomUUID } from "node:crypto";
import { addDecimal } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Columns that can change after the submission, or that are generated per request. */
export const SUBMISSION_EXCLUDED_FIELDS = new Set(["id", "created_at", "updated_at", "idempotency_key", "status", "exchange_rate"]);

const DECIMAL_FIELDS = new Set(["amount", "exchange_rate", "exchangeRate"]);

export class IdempotencyConflictError extends Error {
  constructor() {
    super("This submission key was already used for a different payment.");
    this.name = "IdempotencyConflictError";
  }
}

/** The insert committed on another request. Callers return that payment and discard this attempt. */
export class IdempotentReplay extends Error {
  readonly paymentId: number;

  constructor(paymentId: number) {
    super("Payment submission already saved.");
    this.name = "IdempotentReplay";
    this.paymentId = paymentId;
  }
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export function acceptedIdempotencyKey(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return UUID.test(raw) ? raw : null;
}

/** A rendered form keeps a valid key. Anything else starts a new submission. */
export function keepIdempotencyKey(value: unknown): string {
  return acceptedIdempotencyKey(value) ?? newIdempotencyKey();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalSubmissionValue(field: string, value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (!text) return "";
  if (DECIMAL_FIELDS.has(field)) {
    try {
      return addDecimal(text, "0");
    } catch {
      return text;
    }
  }
  return text;
}

export function submissionFingerprint(fields: Record<string, unknown>): string {
  const lines = Object.keys(fields)
    .filter((field) => !SUBMISSION_EXCLUDED_FIELDS.has(field))
    .sort()
    .map((field) => `${field}=${canonicalSubmissionValue(field, fields[field])}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function fingerprintAssigned(
  entries: Array<{ column: string; value: unknown }>,
  fileHashes: ReadonlyMap<string, string>,
): string {
  const fields: Record<string, unknown> = {};
  for (const entry of entries) {
    if (SUBMISSION_EXCLUDED_FIELDS.has(entry.column)) continue;
    fields[entry.column] = fileHashes.has(entry.column) ? fileHashes.get(entry.column) : entry.value;
  }
  return submissionFingerprint(fields);
}

export type OfficeSubmission = {
  userId: number;
  title: string;
  type: string;
  amount: string;
  paymentDate: string;
  candidateId: number | null;
  agentId: number | null;
  currencyId: number | null;
  paymentMethod: string | null;
  remarks: string | null;
};

export function officeFingerprint(input: OfficeSubmission): string {
  return submissionFingerprint({
    channel: "office",
    userId: input.userId,
    title: input.title,
    type: input.type.trim(),
    amount: input.amount,
    paymentDate: input.paymentDate,
    candidateId: input.candidateId,
    agentId: input.agentId,
    currencyId: input.currencyId,
    paymentMethod: input.paymentMethod,
    remarks: input.remarks,
  });
}

export type WalletSubmission = {
  userId: number;
  title: string;
  type: string;
  candidateId: number | null;
  teacherId: number | null;
  employeeId: number | null;
  employerId: number | null;
  agentId: number | null;
  subAgentId: number | null;
  amount: string;
  currencyId: number;
  paymentMethod: string;
  invoiceNo: string;
  paymentDate: string;
  paymentTime: string | null;
  bankName: string | null;
  accNo: string | null;
  trxNo: string | null;
  accountName: string | null;
  paymentReceiver: string | null;
  paymentReceivedLocation: string | null;
  description: string | null;
  chequeSha256: string;
};

export function walletFingerprint(input: WalletSubmission): string {
  return submissionFingerprint({
    channel: "wallet",
    userId: input.userId,
    title: input.title,
    type: input.type.trim(),
    agentId: input.agentId,
    subAgentId: input.subAgentId,
    candidateId: input.candidateId,
    teacherId: input.teacherId,
    employeeId: input.employeeId,
    employerId: input.employerId,
    amount: input.amount,
    currencyId: input.currencyId,
    paymentMethod: input.paymentMethod,
    invoiceNo: input.invoiceNo,
    paymentDate: input.paymentDate,
    paymentTime: input.paymentTime,
    bankName: input.bankName,
    accNo: input.accNo,
    trxNo: input.trxNo,
    accountName: input.accountName,
    paymentReceiver: input.paymentReceiver,
    paymentReceivedLocation: input.paymentReceivedLocation,
    description: input.description,
    chequeSha256: input.chequeSha256,
  });
}

export function decideSubmission(existing: { fingerprint: string } | null, fingerprint: string): "insert" | "replay" | "conflict" {
  if (!existing) return "insert";
  return existing.fingerprint === fingerprint ? "replay" : "conflict";
}

export function submissionOwnedBy(row: { createdBy: number | null; userId: number | null }, userId: number): boolean {
  if (row.createdBy != null && row.createdBy !== userId) return false;
  if (row.userId != null && row.userId !== userId) return false;
  return true;
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "23505" || code === "P2002") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("payments_idempotency_key_key");
}

export type SubmissionRecord = {
  id: number;
  key: string;
  fingerprint: string;
  posts: number;
  createdBy: number | null;
  userId: number | null;
};

export type SubmissionMemory = {
  rows: SubmissionRecord[];
  nextId: number;
  chain: Promise<void>;
};

export function emptySubmissionMemory(): SubmissionMemory {
  return { rows: [], nextId: 1, chain: Promise.resolve() };
}

/**
 * One database transaction for a submission.
 * The unique key is checked before commit. A ledger failure drops the staged row.
 * A second caller waits, then sees the committed row.
 */
export async function submitOnce(
  memory: SubmissionMemory,
  input: { key: string; fingerprint: string; postsOnCreate: boolean; userId: number; failLedger?: boolean },
): Promise<{ id: number; created: boolean }> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = memory.chain;
  memory.chain = gate;
  await previous;
  try {
    const existing = memory.rows.find((row) => row.key === input.key) ?? null;
    if (existing && !submissionOwnedBy(existing, input.userId)) throw new IdempotencyConflictError();
    const decision = decideSubmission(existing, input.fingerprint);
    if (decision === "conflict") throw new IdempotencyConflictError();
    if (decision === "replay" && existing) return { id: existing.id, created: false };
    if (memory.rows.some((row) => row.key === input.key)) throw new Error("payments_idempotency_key_key");
    if (input.failLedger) throw new Error("ledger failed");
    const row: SubmissionRecord = {
      id: memory.nextId,
      key: input.key,
      fingerprint: input.fingerprint,
      posts: input.postsOnCreate ? 1 : 0,
      createdBy: input.userId,
      userId: input.userId,
    };
    memory.rows.push(row);
    memory.nextId += 1;
    return { id: row.id, created: true };
  } finally {
    release();
  }
}
