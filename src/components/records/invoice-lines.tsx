import { formatMoney } from "@/lib/utils";
import { presentInvoiceLine, sumStoredLineTotals, type StoredInvoiceLine } from "@/lib/invoice-lines";

export function InvoiceLines({ lines }: { lines: StoredInvoiceLine[] }) {
  const storedTotal = sumStoredLineTotals(lines);
  const rows = lines.map(presentInvoiceLine);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Invoice lines</h2>
        <p className="record-section-copy">Saved charge lines for this invoice. Amounts are the stored line values.</p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No invoice lines are stored for this invoice.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Subtotal</th>
                  <th>VAT rate</th>
                  <th>VAT</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{line.unitPrice}</td>
                    <td>{line.subTotal}</td>
                    <td>{line.vatRate}</td>
                    <td>{line.vatAmount}</td>
                    <td>{line.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {storedTotal != null ? (
              <p className="mt-3 text-sm text-[#26364A]">Stored line total {formatMoney(storedTotal)}</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
