import { presentEducation, type StoredEducation } from "@/lib/educations";

export function Educations({ rows }: { rows: StoredEducation[] }) {
  const educations = rows.map(presentEducation);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Education</h2>
        <p className="record-section-copy">Saved education rows for this user.</p>
        {educations.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No education rows are stored for this user.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Exam</th>
                  <th>Institute</th>
                  <th>Subject</th>
                  <th>Label</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration year</th>
                  <th>Result type</th>
                  <th>Result</th>
                  <th>Achievements</th>
                  <th>Certificate file</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Created by</th>
                  <th>Updated by</th>
                  <th>Board</th>
                  <th>Scale</th>
                  <th>Passing year</th>
                </tr>
              </thead>
              <tbody>
                {educations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.examName}</td>
                    <td>{row.instituteName}</td>
                    <td>{row.subjectGroupMajor}</td>
                    <td>{row.educationLabel}</td>
                    <td>{row.startDate}</td>
                    <td>{row.endDate}</td>
                    <td>{row.durationYear}</td>
                    <td>{row.resultType}</td>
                    <td>{row.result}</td>
                    <td>{row.achievements}</td>
                    <td>{row.certificateFilePath}</td>
                    <td>{row.status}</td>
                    <td>{row.createdAt}</td>
                    <td>{row.updatedAt}</td>
                    <td>{row.createdBy}</td>
                    <td>{row.updatedBy}</td>
                    <td>{row.boardName}</td>
                    <td>{row.scale}</td>
                    <td>{row.passingYear}</td>
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
