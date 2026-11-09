import type { ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ListingPager, ListingShell } from "@/components/records/listing-frame";
import { PARTY_CATEGORIES, type HistoricalAssignmentRow } from "@/lib/historical-party-assignment";
import { assignmentListHref, type AssignmentListPage } from "@/lib/historical-party-assignment-view";

export type AssignmentListFilters = {
  q?: string;
  candidateId?: string;
  partyId?: string;
  partyCategory?: string;
  status?: string;
  closedByUserId?: string;
};

export function AssignmentDenied() {
  return (
    <section className="listing">
      <div className="listing-header">
        <div className="min-w-0">
          <h1 className="listing-title">Historical assignments</h1>
          <p className="listing-desc">You do not have access to historical assignments.</p>
        </div>
      </div>
    </section>
  );
}

export function AssignmentList({
  page,
  filters,
}: {
  page: AssignmentListPage;
  filters: AssignmentListFilters;
}) {
  const previous = page.page > 1 ? assignmentListHref(filters, page.page - 1) : null;
  const next = page.hasMore ? assignmentListHref(filters, page.page + 1) : null;
  const clear = Object.values(filters).some(Boolean);
  return (
    <ListingShell
      title="Historical assignments"
      description="Read-only stored snapshots. Original name and address stay as recorded at assignment."
      count={`${page.total.toLocaleString()} assignments. ${page.pageSize} rows per page.`}
      toolbar={
        <form className="listing-toolbar" action="/historical-assignments">
          <label className="listing-search">
            <span className="sr-only">Search original name</span>
            <Search className="listing-search-icon" />
            <input name="q" defaultValue={filters.q ?? ""} placeholder="Original name" className="listing-field" />
          </label>
          <div className="listing-select">
            <input name="candidateId" defaultValue={filters.candidateId ?? ""} inputMode="numeric" placeholder="Candidate id" className="control" />
          </div>
          <div className="listing-select">
            <input name="partyId" defaultValue={filters.partyId ?? ""} inputMode="numeric" placeholder="Party id" className="control" />
          </div>
          <div className="listing-select">
            <select name="partyCategory" defaultValue={filters.partyCategory ?? ""} className="listing-field">
              <option value="">Category</option>
              {PARTY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="listing-select">
            <select name="status" defaultValue={filters.status ?? ""} className="listing-field">
              <option value="">Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          <div className="listing-select">
            <input
              name="closedByUserId"
              defaultValue={filters.closedByUserId ?? ""}
              inputMode="numeric"
              placeholder="Closing user id"
              className="control"
            />
          </div>
          <button type="submit" className="listing-btn">
            Search
          </button>
          {clear ? (
            <Link href="/historical-assignments" className="listing-clear">
              Clear all
            </Link>
          ) : null}
        </form>
      }
      footer={<ListingPager page={page.page} pages={Math.max(1, Math.ceil(page.total / page.pageSize))} previousHref={previous} nextHref={next} />}
    >
      <table className="listing-table">
        <thead>
          <tr>
            <th>Id</th>
            <th>Candidate id</th>
            <th>Category</th>
            <th>Party id</th>
            <th>Original name</th>
            <th>Original address</th>
            <th>Status</th>
            <th>Became active</th>
            <th>Closed</th>
            <th>View</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.length === 0 ? (
            <tr>
              <td className="listing-empty-cell" colSpan={10}>
                No historical assignments match these filters.
              </td>
            </tr>
          ) : null}
          {page.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/historical-assignments/${row.id}`} className="listing-id">
                  {row.id}
                </Link>
              </td>
              <td>{row.candidateId}</td>
              <td>{row.partyCategory}</td>
              <td>{row.partyId}</td>
              <td>
                <ExactText value={row.originalName} />
              </td>
              <td>
                <ExactText value={row.originalAddress} />
              </td>
              <td>
                <AssignmentStatus status={row.status} />
              </td>
              <td>
                <ExactTime value={row.becameActiveAt} />
              </td>
              <td>
                <ExactTime value={row.closedAt} />
              </td>
              <td>
                <Link href={`/historical-assignments/${row.id}`} className="listing-btn">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListingShell>
  );
}

export function AssignmentDetail({ row }: { row: HistoricalAssignmentRow }) {
  return (
    <section className="listing">
      <div className="listing-header">
        <div className="min-w-0">
          <h1 className="listing-title">Historical assignment {row.id}</h1>
          <p className="listing-desc">Read-only. Snapshot and closure values are the stored fields.</p>
        </div>
        <div className="listing-actions">
          <AssignmentStatus status={row.status} />
          <Link href="/historical-assignments" className="listing-btn">
            Back
          </Link>
        </div>
      </div>
      <AssignmentSection title="Assignment" description="Stored identity. These ids are not looked up as live masters.">
        <Field label="Category" value={row.partyCategory} />
        <Field label="Party id" value={String(row.partyId)} />
        <Field label="Candidate id" value={String(row.candidateId)} />
        <Field label="Status" value={<AssignmentStatus status={row.status} />} />
        <Field label="Became active" value={<ExactTime value={row.becameActiveAt} />} />
      </AssignmentSection>
      <AssignmentSection title="Stored snapshot" description="Original name and each stored address field, including null and empty string.">
        <Field label="Original name" value={<ExactText value={row.originalName} />} />
        <Field label="Original address" value={<ExactText value={row.originalAddress} />} />
        <Field label="Present house" value={<ExactText value={row.presentAddressHouse} />} />
        <Field label="Present road" value={<ExactText value={row.presentAddressRoad} />} />
        <Field label="Present village" value={<ExactText value={row.presentAddressVillage} />} />
        <Field label="Present post" value={<ExactText value={row.presentAddressPost} />} />
        <Field label="Present thana id" value={<ExactId value={row.presentAddressThanaId} />} />
        <Field label="Present district id" value={<ExactId value={row.presentAddressDistrictId} />} />
        <Field label="Present division id" value={<ExactId value={row.presentAddressDivisionId} />} />
        <Field label="Permanent house" value={<ExactText value={row.permanentAddressHouse} />} />
        <Field label="Permanent road" value={<ExactText value={row.permanentAddressRoad} />} />
        <Field label="Permanent village" value={<ExactText value={row.permanentAddressVillage} />} />
        <Field label="Permanent post" value={<ExactText value={row.permanentAddressPost} />} />
        <Field label="Permanent thana id" value={<ExactId value={row.permanentAddressThanaId} />} />
        <Field label="Permanent district id" value={<ExactId value={row.permanentAddressDistrictId} />} />
        <Field label="Permanent division id" value={<ExactId value={row.permanentAddressDivisionId} />} />
      </AssignmentSection>
      <AssignmentSection title="Closure" description="Closure fields stay empty while the assignment is ACTIVE.">
        <Field label="Closure reason" value={<ExactText value={row.closureReason} />} />
        <Field label="Closing user id" value={<ExactId value={row.closedByUserId} />} />
        <Field label="Closed at" value={<ExactTime value={row.closedAt} />} />
      </AssignmentSection>
    </section>
  );
}

export function AssignmentMissing() {
  return (
    <section className="listing">
      <div className="listing-header">
        <div className="min-w-0">
          <h1 className="listing-title">Historical assignment</h1>
          <p className="listing-desc">No historical assignment has that id.</p>
        </div>
        <div className="listing-actions">
          <Link href="/historical-assignments" className="listing-btn">
            Back
          </Link>
        </div>
      </div>
    </section>
  );
}

function AssignmentSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--listing-line)] px-1 py-5">
      <h2 className="text-sm font-semibold text-[var(--listing-heading)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--listing-muted)]">{description}</p>
      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-[var(--listing-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--listing-heading)]">{value}</dd>
    </div>
  );
}

function AssignmentStatus({ status }: { status: "ACTIVE" | "CLOSED" }) {
  const tone = status === "ACTIVE" ? "success" : "danger";
  return <span className={`listing-badge listing-badge-${tone}`}>{status}</span>;
}

export function ExactText({ value }: { value: string | null }) {
  if (value === null) return <span className="listing-muted-text">null</span>;
  if (value === "") return <span className="listing-muted-text">empty</span>;
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function ExactId({ value }: { value: number | null }) {
  if (value === null) return <span className="listing-muted-text">null</span>;
  return <span>{value}</span>;
}

function ExactTime({ value }: { value: Date | null }) {
  if (value === null) return <span className="listing-muted-text">null</span>;
  const text = value.toISOString();
  return <time dateTime={text}>{text}</time>;
}
