import { Plus, Search } from "lucide-react";
import Link from "next/link";
import type { BreadList } from "@/server/browse";
import { isImagePath } from "@/lib/media";
import { FileValue } from "@/components/media/file-value";
import { RowActions } from "@/components/records/row-actions";

function CellValue({ value }: { value: string }) {
  return <FileValue value={value} className="h-12 w-10 rounded-md object-cover" />;
}

function pageHref(slug: string, page: number, q: string, candidate: string, exam: string, size: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (candidate) params.set("candidate", candidate);
  if (exam) params.set("exam", exam);
  if (size !== 10) params.set("size", String(size));
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return `/records/${slug}${text ? `?${text}` : ""}`;
}

export function BreadTable({
  bread,
  q,
  candidate,
  canCreate,
  canEdit,
  canDelete,
  linkRows,
  exam = "",
  extraFor,
}: {
  bread: BreadList;
  q: string;
  candidate: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  linkRows: boolean;
  exam?: string;
  extraFor?: (id: number) => Array<{ href: string; label: string }>;
}) {
  const from = bread.total === 0 ? 0 : (bread.page - 1) * bread.pageSize + 1;
  const to = Math.min(bread.page * bread.pageSize, bread.total);
  const pages = Math.max(1, Math.ceil(bread.total / bread.pageSize));

  return (
    <section className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Directory</p>
          <h1 className="page-title mt-1">{bread.title}</h1>
        </div>
        {canCreate ? (
          <Link href={`/records/${bread.slug}/new`} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Add New
          </Link>
        ) : null}
      </div>

      {/* Filter / search bar */}
      <form
        className="surface flex flex-wrap items-center gap-3 p-3"
        action={`/records/${bread.slug}`}
      >
        {candidate ? <input type="hidden" name="candidate" value={candidate} /> : null}
        {exam ? <input type="hidden" name="exam" value={exam} /> : null}

        <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-muted">
          Show
          <select name="size" defaultValue={String(bread.pageSize)} className="control h-9 w-20 text-sm">
            {["10", "25", "50", "100"].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search records…"
            className="control pl-8"
          />
        </div>

        <button type="submit" className="btn-primary shrink-0">
          Search
        </button>
      </form>

      {/* Data grid */}
      <div className="surface overflow-x-auto">
        <table className="data-grid min-w-full">
          <thead>
            <tr>
              {bread.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bread.rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(bread.columns.length + 1, 1)}>
                  <div className="py-10 text-center">
                    <p className="text-[13px] font-medium text-muted">No records found</p>
                    <p className="mt-1 text-[12px] text-muted/70">
                      {q ? "Try adjusting your search terms." : "No active records match your filters."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
            {bread.rows.map((row) => (
              <tr key={row.id}>
                {bread.columns.map((column, index) => {
                  const value = row.cells[column.key] || "";
                  return (
                    <td key={column.key} className="max-w-xs">
                      {linkRows && index === 0 && !isImagePath(value) ? (
                        <Link
                          href={`/records/${bread.slug}/${row.id}`}
                          className="font-semibold text-accent hover:underline"
                        >
                          {value || "—"}
                        </Link>
                      ) : (
                        <CellValue value={value} />
                      )}
                    </td>
                  );
                })}
                <td>
                  {linkRows ? (
                    <RowActions
                      slug={bread.slug}
                      id={row.id}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      extra={extraFor?.(row.id)}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[12.5px] text-muted">
          {bread.total === 0 ? (
            "No results"
          ) : (
            <>
              Showing <span className="font-medium text-foreground">{from}</span>–
              <span className="font-medium text-foreground">{to}</span> of{" "}
              <span className="font-medium text-foreground">{bread.total.toLocaleString()}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {bread.page > 1 ? (
            <Link
              href={pageHref(bread.slug, bread.page - 1, q, candidate, exam, bread.pageSize)}
              className="btn-quiet h-9"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium">
            {bread.page} / {pages}
          </span>
          {bread.page < pages ? (
            <Link
              href={pageHref(bread.slug, bread.page + 1, q, candidate, exam, bread.pageSize)}
              className="btn-quiet h-9"
            >
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
