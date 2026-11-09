import { formatMoney } from "@/lib/utils";
import { presentTicketInvoiceLine, sumStoredTicketLineTotals, type StoredTicketInvoiceLine } from "@/lib/ticket-invoice-lines";

export function TicketInvoiceLines({ lines }: { lines: StoredTicketInvoiceLine[] }) {
  const storedTotal = sumStoredTicketLineTotals(lines);
  const rows = lines.map(presentTicketInvoiceLine);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Ticket invoice lines</h2>
        <p className="record-section-copy">Saved lines for this ticket invoice. Names, links, and amounts are the stored values.</p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No ticket invoice lines are stored for this invoice.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Passport</th>
                  <th>Candidate</th>
                  <th>Is candidate</th>
                  <th>Remarks</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Total</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.passportNo}</td>
                    <td>{line.candidateId}</td>
                    <td>{line.isCandidate}</td>
                    <td>{line.remarks}</td>
                    <td>{line.quantity}</td>
                    <td>{line.unitPrice}</td>
                    <td>{line.total}</td>
                    <td>{line.createdAt}</td>
                    <td>{line.updatedAt}</td>
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
