import { presentSkill, type StoredSkill } from "@/lib/skills";

export function Skills({ rows }: { rows: StoredSkill[] }) {
  const skills = rows.map(presentSkill);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Skills</h2>
        <p className="record-section-copy">Saved skill rows for this user. Scores are the stored values.</p>
        {skills.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No skill rows are stored for this user.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Title</th>
                  <th>Institute</th>
                  <th>Details</th>
                  <th>Result score</th>
                  <th>Certificate file</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                  <th>Exam score</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.title}</td>
                    <td>{row.instituteName}</td>
                    <td>{row.details}</td>
                    <td>{row.resultScore}</td>
                    <td>{row.certificateFilePath}</td>
                    <td>{row.status}</td>
                    <td>{row.createdAt}</td>
                    <td>{row.updatedAt}</td>
                    <td>{row.createdBy}</td>
                    <td>{row.updatedBy}</td>
                    <td>{row.examScore}</td>
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
