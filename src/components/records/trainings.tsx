import { presentTraining, type StoredTraining } from "@/lib/trainings";

export function Trainings({ rows }: { rows: StoredTraining[] }) {
  const trainings = rows.map(presentTraining);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Training</h2>
        <p className="record-section-copy">Saved training rows for this user. Country id is the stored value.</p>
        {trainings.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No training rows are stored for this user.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Title</th>
                  <th>Institute</th>
                  <th>Topics</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Duration type</th>
                  <th>Country id</th>
                  <th>Descriptions</th>
                  <th>Achievements</th>
                  <th>Certificate file</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {trainings.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.title}</td>
                    <td>{row.instituteName}</td>
                    <td>{row.topics}</td>
                    <td>{row.startDate}</td>
                    <td>{row.endDate}</td>
                    <td>{row.duration}</td>
                    <td>{row.durationType}</td>
                    <td>{row.countryId}</td>
                    <td>{row.descriptions}</td>
                    <td>{row.achievements}</td>
                    <td>{row.certificateFilePath}</td>
                    <td>{row.status}</td>
                    <td>{row.createdAt}</td>
                    <td>{row.updatedAt}</td>
                    <td>{row.createdBy}</td>
                    <td>{row.updatedBy}</td>
                    <td>{row.address}</td>
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
