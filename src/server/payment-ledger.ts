import { pool } from "@/lib/db";
import {
  applyPaymentBalance,
  inTransaction,
  PAYMENT_LOCK_SQL,
  PaymentLedgerError,
  type PaymentFacts,
  type SqlClient,
} from "@/lib/payment-ledger";

type RawFacts = {
  status: string | null;
  type: string | null;
  amount: string | null;
  exchangeRate: string | null;
  currencyId: unknown;
  agentId: unknown;
  subAgentId: unknown;
};

type RawQuery = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export async function withPgTransaction<T>(work: (db: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await inTransaction(
      {
        begin: async () => {
          await client.query("BEGIN");
        },
        commit: async () => {
          await client.query("COMMIT");
        },
        rollback: async () => {
          await client.query("ROLLBACK");
        },
      },
      () =>
        work({
          query: async (sql, params) => {
            const result = await client.query(sql, params);
            return { rows: result.rows, rowCount: result.rowCount };
          },
        }),
    );
  } finally {
    client.release();
  }
}

export async function readPaymentFacts(db: SqlClient, id: number, lock: boolean): Promise<PaymentFacts | null> {
  const sql = lock ? PAYMENT_LOCK_SQL : PAYMENT_LOCK_SQL.replace(/\s+FOR UPDATE\s*$/i, "");
  const result = await db.query<RawFacts>(sql, [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    status: row.status,
    type: row.type,
    amount: row.amount,
    exchangeRate: row.exchangeRate,
    currencyId: integerOrNull(row.currencyId),
    agentId: integerOrNull(row.agentId),
    subAgentId: integerOrNull(row.subAgentId),
  };
}

/** Lock the new payment and post its opening balance inside the caller's transaction. */
export async function syncInsertedPayment(tx: RawQuery, id: number): Promise<void> {
  const db = prismaSql(tx);
  const after = await readPaymentFacts(db, id, true);
  if (!after) throw new PaymentLedgerError();
  await applyPaymentBalance(db, null, after);
}

export async function syncPaymentChange(db: SqlClient, before: PaymentFacts | null, id: number): Promise<void> {
  const after = await readPaymentFacts(db, id, false);
  if (!after) throw new PaymentLedgerError();
  await applyPaymentBalance(db, before, after);
}

function prismaSql(tx: RawQuery): SqlClient {
  return {
    async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const rows = await tx.$queryRawUnsafe<T[]>(sql, ...params);
      return { rows, rowCount: rows.length };
    },
  };
}

function integerOrNull(value: unknown): number | null {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}
