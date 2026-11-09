import { describe, expect, it } from "vitest";
import { addDecimal, decimalEquals, divideDecimal, formatFixed, isPositiveAmount } from "@/lib/money";
import { formatMoney } from "@/lib/utils";
import {
  applyPaymentBalance,
  balanceMoves,
  balanceUpdateSql,
  formatLedgerMoney,
  inTransaction,
  ledgerParty,
  PAYMENT_LOCK_SQL,
  PAYMENT_POSTING_KEY,
  PaymentLedgerError,
  paymentEffect,
  runningLedgerBalances,
  type PaymentFacts,
  type SqlClient,
} from "@/lib/payment-ledger";

const pending = (overrides: Partial<PaymentFacts> = {}): PaymentFacts => ({
  status: "P",
  type: "DR",
  amount: "100.2500",
  exchangeRate: "1",
  currencyId: 2,
  agentId: 4,
  subAgentId: 0,
  ...overrides,
});

const approved = (overrides: Partial<PaymentFacts> = {}): PaymentFacts => pending({ status: "A", ...overrides });

describe("payment identity", () => {
  it("posts by payment id and still accepts a second installment", () => {
    expect(PAYMENT_POSTING_KEY).toBe("payments.id");
    const first = balanceMoves(null, approved({ amount: "40.0000" }));
    const second = balanceMoves(null, approved({ amount: "60.5000" }));
    expect(first).toEqual([{ party: { table: "agents", id: 4 }, delta: "40" }]);
    expect(second).toEqual([{ party: { table: "agents", id: 4 }, delta: "60.5" }]);
    expect(addDecimal(first[0].delta, second[0].delta)).toBe("100.5");
  });

  it("does not use the invoice number as a duplicate key", () => {
    const sameAmount = approved({ amount: "25.0000" });
    expect(balanceMoves(null, sameAmount)).toEqual(balanceMoves(null, { ...sameAmount }));
    expect(PAYMENT_LOCK_SQL).toContain("WHERE id = $1");
    expect(PAYMENT_LOCK_SQL).toContain("FOR UPDATE");
    expect(PAYMENT_LOCK_SQL).not.toContain("invoice_no");
  });
});

describe("exact payment arithmetic", () => {
  it("adds decimal amounts without binary fractions", () => {
    let running = "0";
    for (let index = 0; index < 100; index += 1) running = addDecimal(running, "0.01");
    expect(running).toBe("1");
    expect(addDecimal("0.10", "0.20")).toBe("0.3");
    expect(decimalEquals(addDecimal("0.10", "0.20"), "0.30")).toBe(true);
  });

  it("converts currency 1 by numeric division and leaves the payment amount unchanged", () => {
    expect(paymentEffect(approved({ amount: "110.0000", currencyId: 1, exchangeRate: "110" }))).toBe("1");
    expect(paymentEffect(approved({ amount: "1.0050", currencyId: 2, exchangeRate: "1" }))).toBe("1.005");
    expect(divideDecimal("1.005", "1", 2)).toBe("1.01");
    expect(formatLedgerMoney("€", "1.005")).toBe("€ 1.01");
    expect(formatLedgerMoney("€", "3845.0000")).toBe("€ 3845");
    expect(formatMoney("1234.5")).toBe("1,234.50");
    expect(formatFixed("10.2", 2)).toBe("10.20");
  });

  it("keeps the wallet running balance on exact approved totals", () => {
    const balances = runningLedgerBalances([
      { status: "A", type: "DR", amount: "0.10", currencyId: 2, exchangeRate: "1" },
      { status: "P", type: "DR", amount: "9.00", currencyId: 2, exchangeRate: "1" },
      { status: "A", type: "CR", amount: "0.20", currencyId: 2, exchangeRate: "1" },
    ]);
    expect(balances).toEqual(["0.1", "0.1", "-0.1"]);
  });
});

describe("wallet posting", () => {
  it("credits an agent DR once and ignores a repeated approval", () => {
    const first = balanceMoves(pending(), approved());
    const second = balanceMoves(approved(), approved());
    expect(first).toEqual([{ party: { table: "agents", id: 4 }, delta: "100.25" }]);
    expect(second).toEqual([]);
    expect(balanceUpdateSql("agents")).toContain("+ $2::numeric");
    expect(balanceUpdateSql("agents")).not.toContain("::float");
  });

  it("posts a sub-agent wallet when that id is present and still allows the parent agent id", () => {
    expect(ledgerParty(approved({ agentId: 4, subAgentId: 9 }))).toEqual({ table: "sub_agents", id: 9 });
    expect(balanceMoves(null, approved({ amount: "2.5000", agentId: 4, subAgentId: 9 }))).toEqual([
      { party: { table: "sub_agents", id: 9 }, delta: "2.5" },
    ]);
  });

  it("does not post a pending rejection or a pending cancellation", () => {
    expect(balanceMoves(pending(), pending({ status: "R" }))).toEqual([]);
    expect(balanceMoves(pending(), pending({ status: "C" }))).toEqual([]);
    expect(balanceMoves(null, pending())).toEqual([]);
  });

  it("reverses an approved payment once when it is rejected or cancelled", () => {
    expect(balanceMoves(approved(), approved({ status: "R" }))).toEqual([
      { party: { table: "agents", id: 4 }, delta: "-100.25" },
    ]);
    expect(balanceMoves(approved({ type: "CR", amount: "15.0000" }), approved({ type: "CR", amount: "15.0000", status: "C" }))).toEqual([
      { party: { table: "agents", id: 4 }, delta: "15" },
    ]);
  });

  it("serializes two approvals of the same payment so the balance moves once", async () => {
    let facts = pending();
    let balance = "10";
    const mutex = { chain: Promise.resolve() };
    const approve = () => {
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const previous = mutex.chain;
      mutex.chain = gate;
      return previous.then(() => {
        try {
          const moves = balanceMoves(facts, approved());
          for (const move of moves) balance = addDecimal(balance, move.delta);
          facts = approved();
          return moves;
        } finally {
          release();
        }
      });
    };
    const [first, second] = await Promise.all([approve(), approve()]);
    const posted = first.length + second.length;
    expect(posted).toBe(1);
    expect(balance).toBe("110.25");
    expect(facts.status).toBe("A");
  });

  it("rolls the payment status back when the balance write fails", async () => {
    const state = { status: "P", balance: "50.0000" };
    const snapshot = { ...state };
    const db: SqlClient = {
      query: async () => ({ rows: [], rowCount: 0 }),
    };
    await expect(
      inTransaction(
        {
          begin: async () => {
            snapshot.status = state.status;
            snapshot.balance = state.balance;
          },
          commit: async () => {},
          rollback: async () => {
            state.status = snapshot.status;
            state.balance = snapshot.balance;
          },
        },
        async () => {
          state.status = "A";
          state.balance = addDecimal(state.balance, "100.25");
          await applyPaymentBalance(db, pending(), approved());
        },
      ),
    ).rejects.toBeInstanceOf(PaymentLedgerError);
    expect(state).toEqual({ status: "P", balance: "50.0000" });
  });

  it("rejects a non-positive wallet amount without using a binary comparison", () => {
    expect(isPositiveAmount("0.0001")).toBe(true);
    expect(isPositiveAmount("0.0000")).toBe(false);
    expect(isPositiveAmount("0")).toBe(false);
    expect(isPositiveAmount("10.125")).toBe(true);
    expect(isPositiveAmount("10.12345")).toBe(false);
  });
});
