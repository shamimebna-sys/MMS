import { presentExperience, type StoredExperience } from "@/lib/experiences";

export function Experiences({ rows }: { rows: StoredExperience[] }) {
  const experiences = rows.map(presentExperience);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Experience</h2>
        <p className="record-section-copy">Saved experience rows for this user. Country id is the stored value.</p>
        {experiences.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No experience rows are stored for this user.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Company</th>
                  <th>Address</th>
                  <th>Country id</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Responsibilities</th>
                  <th>Expertise</th>
                  <th>Descriptions</th>
                  <th>Achievements</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                </tr>
              </thead>
              <tbody>
                {experiences.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.companyName}</td>
                    <td>{row.companyAddress}</td>
                    <td>{row.countryId}</td>
                    <td>{row.designation}</td>
                    <td>{row.department}</td>
                    <td>{row.startDate}</td>
                    <td>{row.endDate}</td>
                    <td>{row.responsibilities}</td>
                    <td>{row.expertise}</td>
                    <td>{row.descriptions}</td>
                    <td>{row.achievements}</td>
                    <td>{row.status}</td>
                    <td>{row.createdAt}</td>
                    <td>{row.updatedAt}</td>
                    <td>{row.createdBy}</td>
                    <td>{row.updatedBy}</td>
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
