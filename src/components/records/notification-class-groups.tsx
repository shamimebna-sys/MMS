import { presentNotificationClassGroup, type StoredNotificationClassGroup } from "@/lib/notification-class-groups";

export function NotificationClassGroups({ rows }: { rows: StoredNotificationClassGroup[] }) {
  const groups = rows.map(presentNotificationClassGroup);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Class Group</h2>
        <p className="record-section-copy">Saved class-group links for this notification. The name is the stored class group name.</p>
        {groups.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No class groups are stored for this notification.</p>
        ) : (
          <div className="mt-4 min-w-0 overflow-x-auto">
            <table className="data-grid min-w-full">
              <thead>
                <tr>
                  <th>Class Group</th>
                  <th>Class group id</th>
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
