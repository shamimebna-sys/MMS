import { Plus, Search } from "lucide-react";
import Link from "next/link";
import type { BreadList } from "@/server/browse";
import { isImagePath } from "@/lib/media";
import { FileValue } from "@/components/media/file-value";
import { ListingPager, ListingShell, StatusPill } from "@/components/records/listing-frame";
import { addLabel, isStatusColumn, listingCountLabel, listingDescription } from "@/components/records/listing";
import { RowActions } from "@/components/records/row-actions";
import { isStoredFileImageRef } from "@/components/records/user-listing-avatar";
import { UserListingAvatar } from "@/components/records/user-listing-avatar-view";

function CellValue({ value }: { value: string }) {
  return <FileValue value={value} className="h-10 w-10 rounded-md object-cover" />;
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

function createHref(slug: string, page: number, q: string, candidate: string, exam: string, size: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (candidate) params.set("candidate", candidate);
  if (exam) params.set("exam", exam);
  if (size !== 10) params.set("size", String(size));
  if (page > 1) params.set("page", String(page));
  params.set("create", "1");
  return `/records/${slug}?${params.toString()}`;
}

export function BreadTable({
  bread,
  q,
  candidate,
  canCreate,
  canEdit,
  canDelete,
  canView = true,
  linkRows,
  exam = "",
  extraFor,
  embedded = false,
}: {
  bread: BreadList;
  q: string;
  candidate: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView?: boolean;
  linkRows: boolean;
  exam?: string;
  extraFor?: (id: number) => Array<{ href: string; label: string }>;
  embedded?: boolean;
}) {
  const from = bread.total === 0 ? 0 : (bread.page - 1) * bread.pageSize + 1;
  const to = Math.min(bread.page * bread.pageSize, bread.total);
  const pages = Math.max(1, Math.ceil(bread.total / bread.pageSize));
  const filtered = Boolean(q) || bread.pageSize !== 10;

  return (
    <ListingShell
      embedded={embedded}
      title={bread.title}
      description={listingDescription(bread.slug, bread.title)}
      count={listingCountLabel(bread.title, from, to, bread.total)}
      action={
        canCreate ? (
          <Link href={createHref(bread.slug, bread.page, q, candidate, exam, bread.pageSize)} scroll={false} className="listing-cta">
            <Plus className="h-4 w-4" />
            {addLabel(bread.title)}
          </Link>
        ) : null
      }
      toolbar={
        <form className="listing-toolbar" action={`/records/${bread.slug}`}>
          {candidate ? <input type="hidden" name="candidate" value={candidate} /> : null}
          {exam ? <input type="hidden" name="exam" value={exam} /> : null}
          <label className="listing-search">
            <span className="sr-only">Search {bread.title}</span>
            <Search className="listing-search-icon" />
            <input
              name="q"
              defaultValue={q}
              placeholder={`Search ${bread.title.toLowerCase()}…`}
              className="listing-field"
            />
          </label>
          <label className="listing-select">
            <span className="sr-only">Rows per page</span>
            <select name="size" defaultValue={String(bread.pageSize)} className="listing-field" aria-label="Rows per page">
              {["10", "25", "50", "100"].map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="listing-btn">
            Search
          </button>
          {filtered ? (
            <Link href={pageHref(bread.slug, 1, "", candidate, exam, 10)} className="listing-clear">
              Clear all
            </Link>
          ) : null}
        </form>
      }
      footer={
        <ListingPager
          page={bread.page}
          pages={pages}
          previousHref={bread.page > 1 ? pageHref(bread.slug, bread.page - 1, q, candidate, exam, bread.pageSize) : null}
          nextHref={bread.page < pages ? pageHref(bread.slug, bread.page + 1, q, candidate, exam, bread.pageSize) : null}
        />
      }
    >
      <table className="listing-table">
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
              <td className="listing-empty-cell" colSpan={Math.max(bread.columns.length + 1, 1)}>
                <p className="text-[13px] font-medium text-[var(--listing-muted)]">No records found</p>
                <p className="mt-1 text-[12px] text-[var(--listing-faint)]">
                  {q ? "Try adjusting your search terms." : "No active records match your filters."}
                </p>
              </td>
            </tr>
          ) : null}
          {bread.rows.map((row) => (
            <tr key={row.id}>
              {bread.columns.map((column, index) => {
                const value = row.cells[column.key] || "";
                return (
                  <td key={column.key}>
                    {bread.slug === "users" && isStoredFileImageRef(value) ? (
                      <UserListingAvatar src={value} />
                    ) : linkRows && canView && index === 0 && !isImagePath(value) ? (
                      <Link href={`/records/${bread.slug}/${row.id}`} className="listing-id">
                        {value || "—"}
                      </Link>
                    ) : isStatusColumn(column.label) ? (
                      <StatusPill value={value} />
                    ) : (
                      <CellValue value={value} />
                    )}
                  </td>
                );
              })}
              <td className="listing-actions-cell">
                {linkRows ? (
                  <RowActions
                    slug={bread.slug}
                    id={row.id}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canView={canView}
                    extra={extraFor?.(row.id)}
                    appearance="icons"
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListingShell>
  );
}
