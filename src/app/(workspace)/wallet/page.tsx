import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { isImagePath } from "@/lib/media";
import { saveWalletPayment } from "@/app/(workspace)/wallet/actions";
import { keepIdempotencyKey } from "@/lib/payment-idempotency";
import { FormModal } from "@/components/records/form-modal";
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
  searchParams: Promise<{ q?: string; page?: string; size?: string; error?: string; saved?: string; create?: string; idempotency_key?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const wallet = await loadWallet(user, query.q ?? "", Number(query.page ?? "1"), Number(query.size ?? "10"));
  const pages = Math.max(1, Math.ceil(wallet.total / wallet.pageSize));
  const from = wallet.total === 0 ? 0 : (wallet.page - 1) * wallet.pageSize + 1;
  const to = Math.min(wallet.total, wallet.page * wallet.pageSize);
  const closeHref = pageHref(wallet.page, wallet.query, wallet.pageSize);
  const paymentOpen = Boolean(wallet.canAdd && (query.create === "1" || query.error));
  const createParams = new URLSearchParams();
  if (wallet.query) createParams.set("q", wallet.query);
  if (wallet.pageSize !== 10) createParams.set("size", String(wallet.pageSize));
  if (wallet.page > 1) createParams.set("page", String(wallet.page));
  createParams.set("create", "1");

  return (
    <section className="record-canvas">
      <header className="record-header">
        <div>
          <p className="record-kicker">Agent Panel</p>
          <h1 className="record-title">My Wallet</h1>
          <p className="record-lead">Submit a payment and review the ledger for this account.</p>
        </div>
        {wallet.canAdd ? (
          <Link href={`/wallet?${createParams.toString()}`} scroll={false} className="listing-cta">
            <Plus className="h-4 w-4" />
            Add payment
          </Link>
        ) : null}
      </header>

      {query.error && !paymentOpen ? <p className="record-alert">{query.error}</p> : null}
      {query.saved ? <p className="record-success">Payment request saved.</p> : null}

      {paymentOpen ? (
        <FormModal title="Add payment" description="Invoice, amount, account, and the document for this payment." closeHref={closeHref}>
        <form action={saveWalletPayment} className="form-modal-form">
          <input type="hidden" name="idempotency_key" value={keepIdempotencyKey(query.idempotency_key)} />
          <div className="form-modal-body">
            {query.error ? <p className="record-alert form-modal-alert">{query.error}</p> : null}
            <section className="record-section">
              <h2 className="record-section-title">Payment</h2>
              <p className="record-section-copy">Invoice, amount, currency, and when the payment was made.</p>
              <div className="record-grid">
                <label className="block">
                  <span className="record-label">Invoice No.</span>
                  <input name="invoice_no" defaultValue={wallet.invoiceNo} readOnly className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Amount</span>
                  <input name="amount" type="number" min="0" step="0.01" defaultValue="0" required className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Currency</span>
                  <select name="currency_id" defaultValue="1" className="control">
                    {wallet.currencies.map((currency) => (
                      <option key={currency.id} value={currency.id}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="record-label">Payment Method</span>
                  <select name="payment_method" defaultValue="CASH" className="control">
                    <option value="ONLINE">Online Transaction</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash Payment</option>
                  </select>
                </label>
                <label className="block">
                  <span className="record-label">Payment Date</span>
                  <input name="payment_date" type="date" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Payment Time</span>
                  <input name="payment_time" type="time" step="1" className="control" />
                </label>
              </div>
            </section>
            <section className="record-section">
              <h2 className="record-section-title">Account</h2>
              <p className="record-section-copy">Bank account, transaction number, and who received the payment.</p>
              <div className="record-grid">
                <label className="block">
                  <span className="record-label">A/C No.</span>
                  <input name="acc_no" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">A/C Name</span>
                  <input name="account_name" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Bank Name</span>
                  <input name="bank_name" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Trx No</span>
                  <input name="trx_no" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Payment Receiver</span>
                  <input name="payment_receiver" className="control" />
                </label>
                <label className="block">
                  <span className="record-label">Payment Received Location</span>
                  <input name="payment_received_location" className="control" />
                </label>
              </div>
            </section>
            <section className="record-section">
              <h2 className="record-section-title">Documentation</h2>
              <p className="record-section-copy">Optional cheque or transfer document and a short note.</p>
              <div className="record-grid">
                <label className="record-span block">
                  <span className="record-label">Payment Document (Cheque)</span>
                  <input
                    name="cheque_file_path"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="record-file"
                  />
                </label>
                <label className="record-span block">
                  <span className="record-label">Description</span>
                  <textarea name="description" rows={3} className="control" />
                </label>
              </div>
            </section>
          </div>
          <div className="form-modal-footer">
            <a href={closeHref} className="listing-btn">
              Cancel
            </a>
            <button type="submit" className="record-save">
              Save
            </button>
          </div>
        </form>
        </FormModal>
      ) : null}

      <div className="listing-table-wrap">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--listing-line)] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[var(--listing-heading)]">
            Payment Ledger — Balance: {wallet.balanceLabel}
          </h2>
          <form className="flex items-center gap-2" action="/wallet">
            <input type="hidden" name="size" value={wallet.pageSize} />
            <label className="listing-search" style={{ flex: "0 1 16rem" }}>
              <span className="sr-only">Search ledger</span>
              <Search className="listing-search-icon" />
              <input name="q" defaultValue={wallet.query} placeholder="Search…" className="listing-field" />
            </label>
            <button type="submit" className="listing-btn">
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="listing-table">
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
                  <td className="listing-empty-cell" colSpan={7}>
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
                      className={`listing-badge ${
                        entry.status === "Approved"
                          ? "listing-badge-success"
                          : entry.status === "Rejected"
                            ? "listing-badge-danger"
                            : "listing-badge-warning"
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
        <div className="listing-pager">
          <p className="listing-pager-meta">
            {wallet.total === 0 ? (
              "No results"
            ) : (
              <>
                Showing {from}–{to} of {wallet.total}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {wallet.page > 1 ? (
              <Link
                href={pageHref(wallet.page - 1, wallet.query, wallet.pageSize)}
                className="listing-btn"
              >
                ← Previous
              </Link>
            ) : null}
            <span className="listing-page-chip">
              {wallet.page} / {pages}
            </span>
            {wallet.page < pages ? (
              <Link
                href={pageHref(wallet.page + 1, wallet.query, wallet.pageSize)}
                className="listing-btn"
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
