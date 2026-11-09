import type { AccessUser } from "@/lib/auth/permissions";
import { walletBalanceSql, walletLedgerScope, walletPaymentWhere } from "@/lib/auth/wallet-scope";
import { addDecimal } from "@/lib/money";
import { formatLedgerMoney, runningLedgerBalances } from "@/lib/payment-ledger";
import { mediaUrl } from "@/lib/media";
import { pool } from "@/lib/db";

export type WalletEntry = {
  id: number;
  sl: number;
  title: string;
  invoiceNo: string;
  trxNo: string;
  typeLabel: string;
  when: string;
  receiver: string;
  location: string;
  description: string;
  amountLabel: string;
  documentHref: string | null;
  euroRate: string;
  status: "Approved" | "Rejected" | "Pending";
  balanceLabel: string;
};

export type WalletView = {
  canAdd: boolean;
  invoiceNo: string;
  balanceLabel: string;
  currencies: Array<{ id: number; label: string }>;
  entries: WalletEntry[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
};

type RawPayment = {
  id: number;
  title: string;
  type: string;
  amount: string;
  status: string;
  invoice_no: string;
  trx_no: string;
  payment_date: string;
  payment_time: string;
  payment_receiver: string;
  payment_received_location: string;
  description: string;
  cheque_file_path: string;
  payment_method: string;
  currency_id: number | null;
  rate: string;
  symbol: string;
};

export function newInvoiceNo(now = new Date()): string {
  const part = (value: number) => String(value).padStart(2, "0");
  const year = String(now.getFullYear()).slice(2);
  return `${year}${part(now.getMonth() + 1)}${part(now.getDate())}${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}${now.getMilliseconds() % 10}`;
}

export async function loadWallet(user: AccessUser, query: string, page: number, pageSize: number): Promise<WalletView> {
  const ledger = walletLedgerScope(user);
  const balanceQuery = walletBalanceSql(ledger);
  const balance = await pool.query(balanceQuery.sql, balanceQuery.params);
  const currencies = await pool.query(`SELECT id, short_name, symbol FROM currencies ORDER BY id`);
  const params: unknown[] = [];
  const where = `WHERE ${walletPaymentWhere(ledger, params)}`;
  const listed = await pool.query(
    `SELECT p.id, COALESCE(p.title, '') AS title, trim(COALESCE(p.type, '')) AS type, COALESCE(p.amount, 0)::text AS amount,
            trim(COALESCE(p.status, '')) AS status, COALESCE(p.invoice_no, '') AS invoice_no, COALESCE(p.trx_no, '') AS trx_no,
            COALESCE(to_char(p.payment_date, 'YYYY-MM-DD'), '') AS payment_date, COALESCE(p.payment_time, '') AS payment_time,
            COALESCE(p.payment_receiver, '') AS payment_receiver, COALESCE(p.payment_received_location, '') AS payment_received_location,
            COALESCE(p.description, '') AS description, COALESCE(p.cheque_file_path, '') AS cheque_file_path,
            COALESCE(p.payment_method, '') AS payment_method, p.currency_id, COALESCE(p.exchange_rate, 1)::text AS rate,
            COALESCE(c.symbol, '€') AS symbol
     FROM payments p
     LEFT JOIN currencies c ON c.id = p.currency_id
     ${where}
     ORDER BY p.payment_date ASC NULLS LAST, p.payment_time ASC NULLS LAST, p.id ASC`,
    params,
  );
  const rows = listed.rows as RawPayment[];
  const runningBalances = runningLedgerBalances(rows.map((row) => ({
    status: row.status,
    type: row.type,
    amount: row.amount,
    currencyId: row.currency_id,
    exchangeRate: row.rate,
  })));
  const chronological = rows.map((row, index) => ({ row, balance: runningBalances[index] ?? "0" }));
  const term = query.trim().toLowerCase();
  const filtered = chronological.filter(({ row }) => {
    if (!term) return true;
    return [row.title, row.invoice_no, row.trx_no, row.description, row.payment_receiver, row.payment_method]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
  const newestFirst = filtered.slice().reverse();
  const size = [10, 25, 50, 100].includes(pageSize) ? pageSize : 10;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const start = (safePage - 1) * size;
  const entries = newestFirst.slice(start, start + size).map(({ row, balance }, index) => {
    const status = row.status === "A" ? "Approved" : row.status === "R" ? "Rejected" : "Pending";
    const method = row.payment_method.trim() || "SELF";
    const document = row.cheque_file_path.trim();
    return {
      id: row.id,
      sl: start + index + 1,
      title: row.title.trim() || "Payment",
      invoiceNo: row.invoice_no,
      trxNo: row.trx_no,
      typeLabel: `${row.type || "CR"} by ${method}`,
      when: [row.payment_date, row.payment_time].filter(Boolean).join(" "),
      receiver: row.payment_receiver,
      location: row.payment_received_location,
      description: row.description,
      amountLabel: formatLedgerMoney(row.symbol, row.amount),
      documentHref: document ? mediaUrl(document) : "",
      euroRate: row.currency_id === 1 ? `${addDecimal(row.rate, "0")} ${row.symbol}` : "",
      status,
      balanceLabel: formatLedgerMoney("€", balance),
    } satisfies WalletEntry;
  });
  return {
    canAdd: user.agentId != null || user.subAgentId != null,
    invoiceNo: newInvoiceNo(),
    balanceLabel: formatLedgerMoney("€", String(balance.rows[0]?.balance ?? "0")),
    currencies: (currencies.rows as Array<{ id: number; short_name: string | null; symbol: string | null }>).map((row) => ({
      id: row.id,
      label: `${row.short_name ?? "Currency"} (${row.symbol ?? ""})`.trim(),
    })),
    entries,
    total: newestFirst.length,
    page: safePage,
    pageSize: size,
    query,
  };
}
