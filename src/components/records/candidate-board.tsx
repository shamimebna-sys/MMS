import { Plus, Search } from "lucide-react";
import Link from "next/link";
import type { CandidateFilters, CandidateRow, FilterOption } from "@/server/candidate-board";
import { CANDIDATE_PAGE_SIZE } from "@/server/candidate-board";
import { Portrait } from "@/components/media/portrait";
import { RowActions } from "@/components/records/row-actions";
import { statusLabel } from "@/lib/utils";

function queryString(filters: CandidateFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.field && filters.field !== "name") params.set("field", filters.field);
  if (filters.group) params.set("group", filters.group);
  if (filters.agent) params.set("agent", filters.agent);
  if (filters.agency) params.set("agency", filters.agency);
  if (filters.company) params.set("company", filters.company);
  if (filters.position) params.set("position", filters.position);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function SelectFilter({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: FilterOption[];
}) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
      <span>{label.replace(/^All /, "")}</span>
      <select name={name} defaultValue={value} className="control text-[13px] normal-case tracking-normal font-normal">
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status) || status || "—";
  const cls =
    label === "Active"
      ? "badge badge-success"
      : label === "Inactive" || label === "Rejected"
        ? "badge badge-danger"
        : label === "Pending"
          ? "badge badge-warning"
          : "badge badge-neutral";
  return <span className={cls}>{label}</span>;
}

export function CandidateBoard({
  rows,
  total,
  page,
  filters,
  canCreate,
  canEdit,
  canDelete,
  options,
  showGroupAndAgent = true,
}: {
  rows: CandidateRow[];
  total: number;
  page: number;
  filters: CandidateFilters;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  options: {
    groups: FilterOption[];
    agents: FilterOption[];
    agencies: FilterOption[];
    companies: FilterOption[];
    positions: FilterOption[];
  };
  showGroupAndAgent?: boolean;
}) {
  const from = total === 0 ? 0 : (page - 1) * CANDIDATE_PAGE_SIZE + 1;
  const to = Math.min(page * CANDIDATE_PAGE_SIZE, total);
  const pages = Math.max(1, Math.ceil(total / CANDIDATE_PAGE_SIZE));

  return (
    <section className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Directory</p>
          <h1 className="page-title mt-1">Candidates</h1>
        </div>
        {canCreate ? (
          <Link href="/records/candidates/new" className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Add New
          </Link>
        ) : null}
      </div>

      {/* Filters */}
      <form className="surface grid gap-4 p-4 md:grid-cols-3 xl:grid-cols-6" action="/records/candidates">
        {showGroupAndAgent ? (
          <SelectFilter name="group" label="All Groups" value={filters.group} options={options.groups} />
        ) : null}
        {showGroupAndAgent ? (
          <SelectFilter name="agent" label="All Agents" value={filters.agent} options={options.agents} />
        ) : null}
        <SelectFilter name="agency" label="All Agencies" value={filters.agency} options={options.agencies} />
        <SelectFilter name="company" label="All Company" value={filters.company} options={options.companies} />
        <SelectFilter
          name="position"
          label="All Licence Positions"
          value={filters.position}
          options={options.positions}
        />
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          Search field
          <select name="field" defaultValue={filters.field || "name"} className="control text-[13px] normal-case tracking-normal font-normal">
            <option value="code">Code</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="mobile">Mobile</option>
            <option value="passport_no">Passport No</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted md:col-span-2">
          Search
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Name, code, passport, mobile, email"
              className="control pl-8 text-[13px] normal-case tracking-normal font-normal"
            />
          </div>
        </label>
        <div className="flex items-end">
          <button type="submit" className="btn-primary">
            Search
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="surface overflow-x-auto">
        <table className="data-grid min-w-[1400px]">
          <thead>
            <tr>
              {[
                "Candidate",
                "Passport No",
                "Status",
                "Agent",
                "Group",
                "Agency",
                "Company",
                "License Position",
                "Company Status",
                "ARC NO.",
                "MP/Visa",
                "Labour Expire",
                "Live Status",
                "Payment",
                "Actions",
              ].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15}>
                  <div className="py-12 text-center">
                    <p className="text-[13px] font-medium text-muted">No candidates found</p>
                    <p className="mt-1 text-[12px] text-muted/70">
                      {filters.q ? "Try adjusting your search terms." : "No candidates match your current filters."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <Portrait path={row.photo} name={row.name} className="h-14 w-11 shrink-0 rounded-lg" />
                    <div>
                      <Link
                        href={`/records/candidates/${row.id}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        ({row.code || row.id}) {row.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">Email: {row.email || "—"}</p>
                      <p className="text-xs text-muted">Mobile: {row.mobile || "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="font-mono text-[12.5px]">{row.passportNo || "—"}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td>{row.agentLabel || "—"}</td>
                <td>{row.groupLabel || "—"}</td>
                <td>{row.agencyName || "—"}</td>
                <td>{row.companyName || "—"}</td>
                <td>{row.licensePosition || "—"}</td>
                <td>{row.companyStatus || "—"}</td>
                <td className="font-mono text-[12.5px]">{row.arcNo || "—"}</td>
                <td>{row.visaMp || "—"}</td>
                <td>{row.labourExpire || "—"}</td>
                <td>{row.liveStatus}</td>
                <td>{row.paymentLabel || "—"}</td>
                <td>
                  <RowActions slug="candidates" id={row.id} canEdit={canEdit} canDelete={canDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {total === 0 ? (
            "No results"
          ) : (
            <>
              Showing <span className="font-medium text-foreground">{from}</span>–
              <span className="font-medium text-foreground">{to}</span> of{" "}
              <span className="font-medium text-foreground">{total.toLocaleString()}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={`/records/candidates${queryString(filters, page - 1)}`}
              className="btn-quiet h-9"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12.5px] font-medium">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/records/candidates${queryString(filters, page + 1)}`}
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
