import { presentLanguage, type StoredLanguage } from "@/lib/language-list";

export function LanguageList({ rows }: { rows: StoredLanguage[] }) {
  const languages = rows.map(presentLanguage);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Language list</h2>
        <p className="record-section-copy">Saved language list rows for this user. Status is the stored value.</p>
        {languages.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No language list rows are stored for this user.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Language name</th>
                  <th>Language status</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {languages.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.languageName}</td>
                    <td>{row.languageStatus}</td>
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
