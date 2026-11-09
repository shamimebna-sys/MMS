import { Fragment } from "react";
import { unionsForUpazila, type StoredUnion } from "@/lib/unions";
import { presentUpazila, type StoredUpazila } from "@/lib/upazilas";

export function Upazilas({ rows, unions }: { rows: StoredUpazila[]; unions: StoredUnion[] }) {
  const upazilas = rows.map(presentUpazila);
  return (
    <section className="record-card">
      <div className="record-card-body">
        <h2 className="record-section-title">Upazilas</h2>
        <p className="record-section-copy">Saved upazila rows for this district. Each upazila lists the union rows stored with its id. Name, Bangla name, and URL are the stored values.</p>
        {upazilas.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No upazilas are stored for this district.</p>
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
                {upazilas.map((row) => {
                  const children = unionsForUpazila(unions, row.id);
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>{row.id}</td>
                        <td>{row.districtId}</td>
                        <td>{row.name}</td>
                        <td>{row.bnName}</td>
                        <td>{row.url}</td>
                      </tr>
                      <tr>
                        <td colSpan={5}>
                          <p className="text-sm font-semibold">Unions</p>
                          <p className="text-sm text-muted">Saved union rows for this upazila.</p>
                          {children.length === 0 ? (
                            <p className="mt-2 text-sm text-muted">No unions are stored for this upazila.</p>
                          ) : (
                            <div className="mt-2 min-w-0 overflow-x-auto">
                              <table className="data-grid min-w-full">
                                <thead>
                                  <tr>
                                    <th>Id</th>
                                    <th>Upazila id</th>
                                    <th>Name</th>
                                    <th>Bangla name</th>
                                    <th>URL</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {children.map((child) => (
                                    <tr key={child.id}>
                                      <td>{child.id}</td>
                                      <td>{child.upazillaId}</td>
                                      <td>{child.name}</td>
                                      <td>{child.bnName}</td>
                                      <td>{child.url}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
