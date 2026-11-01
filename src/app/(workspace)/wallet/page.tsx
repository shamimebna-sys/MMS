import Link from "next/link";
import { Search } from "lucide-react";
import { isImagePath } from "@/lib/media";
import { saveWalletPayment } from "@/app/(workspace)/wallet/actions";
import { requireUser } from "@/server/current-user";
import { loadWallet } from "@/server/wallet";

export const dynamic = "force-dynamic";

function pageHref(page: number, query: string, pageSize: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (pageSize !== 10) params.set("size", String(pageSize));
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/wallet?${text}` : "/wallet";
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string; error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const wallet = await loadWallet(user, query.q ?? "", Number(query.page ?? "1"), Number(query.size ?? "10"));
  const pages = Math.max(1, Math.ceil(wallet.total / wallet.pageSize));
  const from = wallet.total === 0 ? 0 : (wallet.page - 1) * wallet.pageSize + 1;
  const to = Math.min(wallet.total, wallet.page * wallet.pageSize);

  return (
    <section className="space-y-5">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Agent Panel</p>
        <h1 className="page-title mt-1">My Wallet</h1>
      </div>

      {/* Feedback messages */}
      {query.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {query.error}
        </div>
      ) : null}
      {query.saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          Payment request saved.
        </div>
      ) : null}

      {/* Add payment form */}
      {wallet.canAdd ? (
        <form action={saveWalletPayment} className="surface p-5 md:p-7">
          <h2 className="mb-5 text-[15px] font-semibold">Add Payment</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Invoice No.
              <input
                name="invoice_no"
                defaultValue={wallet.invoiceNo}
                readOnly
                className="control"
                placeholder="Order No."
              />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                required
                className="control"
                placeholder="Amount"
              />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Currency
              <select name="currency_id" defaultValue="1" className="control">
                {wallet.currencies.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Method
              <select name="payment_method" defaultValue="CASH" className="control">
                <option value="ONLINE">Online Transaction</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash Payment</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              A/C No.
              <input name="acc_no" className="control" placeholder="Acc No" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              A/C Name
              <input name="account_name" className="control" placeholder="A/C No." />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Bank Name
              <input name="bank_name" className="control" placeholder="Bank Name" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Trx No
              <input name="trx_no" className="control" placeholder="Trx No" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Date
              <input name="payment_date" type="date" className="control" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Time
              <input name="payment_time" type="time" step="1" className="control" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Receiver
              <input name="payment_receiver" className="control" placeholder="Payment Receiver" />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Received Location
              <input
                name="payment_received_location"
                className="control"
                placeholder="Payment Received Location"
              />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium">
              Payment Document (Cheque)
              <input
                name="cheque_file_path"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="control"
              />
            </label>
            <label className="grid gap-1.5 text-[12.5px] font-medium md:col-span-2">
              Description
              <textarea name="description" rows={3} className="control" placeholder="Description" />
            </label>
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <button type="submit" className="btn-primary">
              Save payment
            </button>
          </div>
        </form>
      ) : null}

      {/* Ledger table */}
      <div className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[14.5px] font-semibold">
            Payment Ledger &mdash; Balance:{" "}
            <span className="text-accent">{wallet.balanceLabel}</span>
          </h2>
          <form className="flex items-center gap-2" action="/wallet">
            <input type="hidden" name="size" value={wallet.pageSize} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                name="q"
                defaultValue={wallet.query}
                placeholder="Search…"
                className="control w-44 pl-8"
              />
            </div>
            <button type="submit" className="btn-quiet">
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="data-grid min-w-full">
            <thead>
              <tr>
                <th>SL.</th>
                <th>Transaction</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Payment Doc.</th>
                <th>Status</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {wallet.entries.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="py-10 text-center">
                      <p className="text-[13px] font-medium text-muted">No transactions found</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {wallet.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-[13px] tabular-nums">{entry.sl}</td>
                  <td className="min-w-72 whitespace-normal text-[12.5px] leading-6">
                    <div className="font-medium">Title: {entry.title}</div>
                    {entry.invoiceNo ? (
                      <div className="text-muted">Invoice No.: {entry.invoiceNo}</div>
                    ) : null}
                    {entry.trxNo ? <div className="text-muted">Trx No.: {entry.trxNo}</div> : null}
                    <div className="text-muted">Type: {entry.typeLabel}</div>
                    {entry.when ? (
                      <div className="text-muted">Payment Date: {entry.when}</div>
                    ) : null}
                    {entry.receiver ? (
                      <div className="text-muted">Payment Receiver: {entry.receiver}</div>
                    ) : null}
                    {entry.location ? (
                      <div className="text-muted">
                        Payment Received Location: {entry.location}
                      </div>
                    ) : null}
                    {entry.euroRate ? (
                      <div className="text-muted">Euro Rate: {entry.euroRate}</div>
                    ) : null}
                  </td>
                  <td className="text-[13px]">{entry.description || "—"}</td>
                  <td className="text-[13px] tabular-nums">Request Amount: {entry.amountLabel}</td>
                  <td>
                    {entry.documentHref ? (
                      isImagePath(entry.documentHref) ? (
                        <a href={entry.documentHref} target="_blank" rel="noreferrer">
                          <img
                            src={entry.documentHref}
                            alt="Payment document"
                            className="h-12 w-10 rounded-md object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={entry.documentHref}
                          className="text-[13px] font-medium text-accent hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      )
                    ) : (
                      <span className="text-[13px] text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        entry.status === "Approved"
                          ? "badge-success"
                          : entry.status === "Rejected"
                            ? "badge-danger"
                            : "badge-warning"
                      }`}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="text-[13px] font-medium tabular-nums">{entry.balanceLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-[12.5px] text-muted">
            {wallet.total === 0 ? (
              "No results"
            ) : (
              <>
                Showing <span className="font-medium text-foreground">{from}</span>–
                <span className="font-medium text-foreground">{to}</span> of{" "}
                <span className="font-medium text-foreground">{wallet.total}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {wallet.page > 1 ? (
              <Link
                href={pageHref(wallet.page - 1, wallet.query, wallet.pageSize)}
                className="btn-quiet h-9"
              >
                ← Previous
              </Link>
            ) : null}
            <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium">
              {wallet.page} / {pages}
            </span>
            {wallet.page < pages ? (
              <Link
                href={pageHref(wallet.page + 1, wallet.query, wallet.pageSize)}
                className="btn-quiet h-9"
              >
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
