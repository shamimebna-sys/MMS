import { presentLicensePosition, type StoredLicensePosition } from "@/lib/license-positions";

export function LicensePositions({ rows }: { rows: StoredLicensePosition[] }) {
  const positions = rows.map(presentLicensePosition);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Positions</h2>
        <p className="record-section-copy">Saved position rows for this license. Quantity is the stored value.</p>
        {positions.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No positions are stored for this license.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Position id</th>
                  <th>Quantity</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.positionId}</td>
                    <td>{row.quantity}</td>
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
