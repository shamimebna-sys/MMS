import { presentThana, type StoredThana } from "@/lib/thanas";

export function Thanas({ rows }: { rows: StoredThana[] }) {
  const thanas = rows.map(presentThana);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Thanas</h2>
        <p className="record-section-copy">Saved thana rows for this district. Name, Bangla name, and URL are the stored values.</p>
        {thanas.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No thanas are stored for this district.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>District id</th>
                  <th>Name</th>
                  <th>Bangla name</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {thanas.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.districtId}</td>
                    <td>{row.name}</td>
                    <td>{row.bnName}</td>
                    <td>{row.url}</td>
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
