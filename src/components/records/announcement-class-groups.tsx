import { presentAnnouncementClassGroup, type StoredAnnouncementClassGroup } from "@/lib/announcement-class-groups";

export function AnnouncementClassGroups({ rows }: { rows: StoredAnnouncementClassGroup[] }) {
  const groups = rows.map(presentAnnouncementClassGroup);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Groups</h2>
        <p className="record-section-copy">Saved class-group links for this announcement. The name is the stored class group name.</p>
        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No groups are stored for this announcement.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Group id</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.classGroupId}</td>
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
