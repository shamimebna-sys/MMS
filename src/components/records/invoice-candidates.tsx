import { presentInvoiceCandidate, type StoredInvoiceCandidate } from "@/lib/invoice-candidates";

export function InvoiceCandidates({ rows }: { rows: StoredInvoiceCandidate[] }) {
  const links = rows.map(presentInvoiceCandidate);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Candidates</h2>
        <p className="record-section-copy">Saved links from this invoice to candidates. The label is the stored candidate code and name.</p>
        {links.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No candidates are stored for this invoice.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Candidate id</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {links.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{row.candidateId}</td>
                    <td>{row.createdAt}</td>
                    <td>{row.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
