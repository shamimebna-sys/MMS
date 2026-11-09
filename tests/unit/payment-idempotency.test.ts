import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedIdempotencyKey,
  emptySubmissionMemory,
  IdempotencyConflictError,
  isUniqueViolation,
  keepIdempotencyKey,
  newIdempotencyKey,
  officeFingerprint,
  submissionFingerprint,
  submitOnce,
  walletFingerprint,
  type OfficeSubmission,
  type WalletSubmission,
} from "@/lib/payment-idempotency";

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20261105183000_payment_idempotency_key/migration.sql"),
  "utf8",
);

function office(overrides: Partial<OfficeSubmission> = {}): OfficeSubmission {
  return {
    userId: 4,
    title: "Installment",
    type: "CR",
    amount: "100.00",
    paymentDate: "2026-11-05",
    candidateId: 9,
    agentId: 3,
    currencyId: 2,
    paymentMethod: "CASH",
    remarks: null,
    ...overrides,
  };
}

function wallet(overrides: Partial<WalletSubmission> = {}): WalletSubmission {
  return {
    userId: 4,
    title: "New Payment request.",
    type: "CR",
    candidateId: 0,
    teacherId: 0,
    employeeId: 0,
    employerId: 0,
    agentId: 3,
    subAgentId: 0,
    amount: "100.00",
    currencyId: 2,
    paymentMethod: "CASH",
    invoiceNo: "INV-1",
    paymentDate: "2026-11-05",
    paymentTime: null,
    bankName: null,
    accNo: null,
    trxNo: null,
    accountName: null,
    paymentReceiver: null,
    paymentReceivedLocation: null,
    description: null,
    chequeSha256: "",
    ...overrides,
  };
}

describe("payment submission idempotency", () => {
  it("stores a nullable unique key and leaves legacy rows valid", () => {
    expect(migration).toContain('ADD COLUMN "idempotency_key" VARCHAR(36)');
    expect(migration).toContain('CREATE UNIQUE INDEX "payments_idempotency_key_key"');
    expect(migration).not.toMatch(/NOT NULL/i);
    expect(migration).not.toMatch(/invoice_no|trx_no|request_id/i);
  });

  it("keeps one random key for a submission and mints a new key for the next one", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(acceptedIdempotencyKey(first)).toBe(first);
    expect(first).not.toBe(second);
    expect(keepIdempotencyKey(first)).toBe(first);
    expect(acceptedIdempotencyKey("INV-100")).toBeNull();
    expect(keepIdempotencyKey("2026-11-05")).not.toBe("2026-11-05");
  });

  it("treats the same amount text as one payload", () => {
    const left = submissionFingerprint({ amount: "10", title: "Installment" });
    const right = submissionFingerprint({ amount: "10.0000", title: "Installment" });
    expect(left).toBe(right);
    expect(submissionFingerprint({ amount: "10", status: "P" })).toBe(submissionFingerprint({ amount: "10", status: "A" }));
  });

  it("creates one office payment when the same key and payload are submitted twice", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    const fingerprint = officeFingerprint(office());
    const first = await submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 });
    const second = await submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 });
    expect(first).toEqual({ id: 1, created: true });
    expect(second).toEqual({ id: 1, created: false });
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.posts).toBe(1);
  });

  it("posts at most once when two requests share a key", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    const fingerprint = officeFingerprint(office());
    const [left, right] = await Promise.all([
      submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 }),
      submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 }),
    ]);
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.posts).toBe(1);
    expect([left.created, right.created].filter(Boolean)).toHaveLength(1);
    expect(left.id).toBe(right.id);
  });

  it("rejects the same key when the payload differs", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    await submitOnce(memory, { key, fingerprint: officeFingerprint(office({ amount: "100.00" })), postsOnCreate: true, userId: 4 });
    await expect(
      submitOnce(memory, { key, fingerprint: officeFingerprint(office({ amount: "40.00" })), postsOnCreate: true, userId: 4 }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.posts).toBe(1);
  });

  it("allows two identical installments when each submission has its own key", async () => {
    const memory = emptySubmissionMemory();
    const fingerprint = officeFingerprint(office());
    const first = await submitOnce(memory, { key: newIdempotencyKey(), fingerprint, postsOnCreate: true, userId: 4 });
    const second = await submitOnce(memory, { key: newIdempotencyKey(), fingerprint, postsOnCreate: true, userId: 4 });
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(first.id).not.toBe(second.id);
    expect(memory.rows).toHaveLength(2);
    expect(memory.rows.reduce((sum, row) => sum + row.posts, 0)).toBe(2);
  });

  it("returns the original wallet payment without posting a balance", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    const fingerprint = walletFingerprint(wallet({ invoiceNo: "INV-1", amount: "25.00" }));
    const created = await submitOnce(memory, { key, fingerprint, postsOnCreate: false, userId: 4 });
    const replay = await submitOnce(memory, { key, fingerprint, postsOnCreate: false, userId: 4 });
    expect(created).toEqual({ id: replay.id, created: true });
    expect(replay.created).toBe(false);
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.posts).toBe(0);
  });

  it("does not keep a key when the ledger write fails", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    const fingerprint = officeFingerprint(office());
    await expect(submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4, failLedger: true })).rejects.toThrow("ledger failed");
    expect(memory.rows).toHaveLength(0);
    const created = await submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 });
    expect(created).toEqual({ id: 1, created: true });
    expect(memory.rows[0]?.posts).toBe(1);
  });

  it("does not replay a payment owned by someone else", async () => {
    const memory = emptySubmissionMemory();
    const key = newIdempotencyKey();
    const fingerprint = officeFingerprint(office());
    await submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 4 });
    await expect(submitOnce(memory, { key, fingerprint, postsOnCreate: true, userId: 8 })).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(memory.rows).toHaveLength(1);
  });

  it("recognizes the database unique violation", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation(new Error("duplicate key value violates unique constraint \"payments_idempotency_key_key\""))).toBe(true);
    expect(isUniqueViolation(new Error("ledger failed"))).toBe(false);
  });
});
