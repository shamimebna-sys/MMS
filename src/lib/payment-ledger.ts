import {
  addDecimal,
  decimalGreaterThan,
  divideDecimal,
  formatFixed,
  isZeroDecimal,
  negateDecimal,
  roundDecimal,
} from "@/lib/money";

/**
 * The only established payment identity is `payments.id`.
 * `invoice_no` is not unique: the legacy source already contains duplicates.
 * `trx_no` and `request_id` are not unique. Candidate, amount, and date are not a key,
 * because installment and partial payments are separate rows.
 * Ledger posting is therefore idempotent per payment id, not per invoice number.
 */
export const PAYMENT_POSTING_KEY = "payments.id";

export const PAYMENT_LOCK_SQL = `SELECT
  COALESCE(btrim(status::text), '') AS status,
  COALESCE(btrim(type::text), '') AS type,
  amount::text AS amount,
  exchange_rate::text AS "exchangeRate",
  currency_id AS "currencyId",
  agent_id AS "agentId",
  sub_agent_id AS "subAgentId"
FROM payments
WHERE id = $1
FOR UPDATE`;

/** Agent wallets keep eight fractional digits. Sub-agent wallets keep four. */
export function balanceScale(table: WalletTable): number {
  return table === "agents" ? 8 : 4;
}

export function balanceUpdateSql(table: WalletTable): string {
  return `UPDATE ${table} SET balance = COALESCE(balance, 0) + $2::numeric, updated_at = NOW() WHERE id = $1 RETURNING id`;
}

export type WalletTable = "agents" | "sub_agents";

export type PaymentFacts = {
  status: string | null;
  type: string | null;
  amount: string | null;
  exchangeRate: string | null;
  currencyId: number | null;
  agentId: number | null;
  subAgentId: number | null;
};

export type LedgerParty = { table: WalletTable; id: number };

export type BalanceMove = { party: LedgerParty; delta: string };

export class PaymentLedgerError extends Error {
  constructor(message = "Wallet balance could not be updated.") {
    super(message);
    this.name = "PaymentLedgerError";
  }
}

export type SqlClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

export type TransactionSession = {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
};

/**
 * One wallet owns a payment. A positive sub-agent id is that sub-agent's wallet.
 * Otherwise a positive agent id is the agent's wallet. Sentinel 0 is not an owner.
 * Candidate, teacher, and employer balances are not wallet postings.
 */
export function ledgerParty(facts: PaymentFacts): LedgerParty | null {
  const subAgentId = positiveId(facts.subAgentId);
  if (subAgentId) return { table: "sub_agents", id: subAgentId };
  const agentId = positiveId(facts.agentId);
  if (agentId) return { table: "agents", id: agentId };
  return null;
}

/**
 * Approved DR payments add. Every other approved type subtracts.
 * Pending, rejected, and cancelled payments contribute nothing.
 * Currency 1 converts by amount / exchange rate when the rate is above 1.
 * The payment amount itself is not rewritten.
 */
export function paymentEffect(facts: PaymentFacts): string {
  if ((facts.status ?? "").trim() !== "A") return "0";
  const euro = euroAmount(facts.amount, facts.currencyId, facts.exchangeRate);
  return (facts.type ?? "").trim() === "DR" ? euro : negateDecimal(euro);
}

export function euroAmount(amount: string | null, currencyId: number | null, exchangeRate: string | null): string {
  const base = amount == null || amount.trim() === "" ? "0" : amount.trim();
  const rate = exchangeRate == null || exchangeRate.trim() === "" ? "1" : exchangeRate.trim();
  if (currencyId === 1 && decimalGreaterThan(rate, "1")) return divideRounded(base, rate);
  return roundDecimal(base, 8);
}

/** Balance delta from the locked payment facts to the facts just saved. */
export function balanceMoves(before: PaymentFacts | null, after: PaymentFacts | null): BalanceMove[] {
  const grouped = new Map<string, BalanceMove>();
  addEffect(grouped, before, -1);
  addEffect(grouped, after, 1);
  return [...grouped.values()].filter((move) => !isZeroDecimal(move.delta));
}

export function runningLedgerBalances(rows: Array<{
  status: string;
  type: string;
  amount: string;
  currencyId: number | null;
  exchangeRate: string;
}>): string[] {
  let running = "0";
  return rows.map((row) => {
    running = addDecimal(running, paymentEffect({
      status: row.status,
      type: row.type,
      amount: row.amount,
      exchangeRate: row.exchangeRate,
      currencyId: row.currencyId,
      agentId: null,
      subAgentId: null,
    }));
    return running;
  });
}

/** Whole numbers stay whole. Every other amount is shown to the cent, from exact decimals. */
export function formatLedgerMoney(symbol: string, value: string): string {
  const normalized = addDecimal(value, "0");
  const unsigned = normalized.startsWith("-") ? normalized.slice(1) : normalized;
  const fraction = unsigned.split(".")[1] ?? "";
  const mark = symbol.trim() || "€";
  if (fraction.replace(/0+$/, "") === "") {
    const whole = unsigned.split(".")[0] ?? "0";
    return `${mark} ${normalized.startsWith("-") ? "-" : ""}${whole}`;
  }
  return `${mark} ${formatFixed(normalized, 2)}`;
}

export async function inTransaction<T>(session: TransactionSession, work: () => Promise<T>): Promise<T> {
  await session.begin();
  try {
    const result = await work();
    await session.commit();
    return result;
  } catch (error) {
    try {
      await session.rollback();
    } catch {
      /* The original failure is the one the caller handles. */
    }
    throw error;
  }
}

/** Posts the delta. A missing wallet row throws so the caller can roll the payment back. */
export async function applyPaymentBalance(db: SqlClient, before: PaymentFacts | null, after: PaymentFacts | null): Promise<void> {
  for (const move of balanceMoves(before, after)) {
    const updated = await db.query<{ id: number }>(balanceUpdateSql(move.party.table), [move.party.id, move.delta]);
    const count = updated.rows.length > 0 ? updated.rows.length : (updated.rowCount ?? 0);
    if (count !== 1) throw new PaymentLedgerError();
  }
}

function addEffect(grouped: Map<string, BalanceMove>, facts: PaymentFacts | null, sign: 1 | -1): void {
  if (!facts) return;
  const party = ledgerParty(facts);
  if (!party) return;
  const effect = roundDecimal(paymentEffect(facts), balanceScale(party.table));
  if (isZeroDecimal(effect)) return;
  const delta = sign === 1 ? effect : negateDecimal(effect);
  const key = `${party.table}:${party.id}`;
  const existing = grouped.get(key);
  grouped.set(key, { party, delta: existing ? addDecimal(existing.delta, delta) : delta });
}

function positiveId(value: number | null): number | null {
  if (value == null || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function divideRounded(amount: string, rate: string): string {
  return divideDecimal(amount, rate, 8);
}
