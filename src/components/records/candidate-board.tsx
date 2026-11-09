import { Mail, Phone, Plus, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { RoleSelect } from "@/components/records/role-select";
import type { CandidateFilters, CandidateRow, FilterOption } from "@/server/candidate-board";
import { CANDIDATE_PAGE_SIZE } from "@/server/candidate-board";
import { Portrait } from "@/components/media/portrait";
import { addLabel, listingCountLabel, listingDescription, statusTone, type StatusTone } from "@/components/records/listing";
import { ListingPager, ListingShell } from "@/components/records/listing-frame";
import { RowActions } from "@/components/records/row-actions";
import { statusLabel } from "@/lib/utils";
import styles from "./candidate-board.module.css";

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
  const caption = label.replace(/^All /, "");
  if (options.length >= 8) {
    return (
      <div className="listing-select">
        <RoleSelect
          id={`filter-${name}`}
          name={name}
          options={options.map((option) => ({ value: option.id, label: option.label }))}
          defaultValue={value}
          emptyLabel={label}
          searchPlaceholder={`Search ${caption.toLowerCase()}`}
          listLabel={caption}
          emptyMessage={`No matching ${caption.toLowerCase()}`}
          tone="brand"
          triggerClassName="listing-field"
        />
      </div>
    );
  }
  return (
    <label className="listing-select">
      <span className="sr-only">{caption}</span>
      <select name={name} defaultValue={value} className="listing-field" aria-label={caption}>
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

const COLUMNS = [
  ["Candidate", styles.colCandidate],
  ["Passport No", styles.colPassport],
  ["Status", styles.colStatus],
  ["Agent", styles.colAgent],
  ["Group", styles.colGroup],
  ["Agency", styles.colAgency],
  ["Company", styles.colCompany],
  ["License Position", styles.colLicense],
  ["Company Status", styles.colCompanyStatus],
  ["ARC NO.", styles.colArc],
  ["MP/Visa", styles.colVisa],
  ["Labour Expire", styles.colLabour],
  ["Live Status", styles.colLive],
  ["Payment", styles.colPayment],
  ["Actions", styles.colActions],
] as const;

const BADGE_TONE: Record<StatusTone, string> = {
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
  neutral: styles.neutral,
};

function CellValue({ value, mono = false, lines = 1 }: { value: string; mono?: boolean; lines?: 1 | 2 }) {
  const text = value.trim();
  if (!text) return <span className={styles.missing}>—</span>;
  const className = [lines === 2 ? styles.clamp : styles.clip, mono ? styles.mono : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className} title={text}>
      {text}
    </span>
  );
}

function BoardBadge({ value, live = false }: { value: string; live?: boolean }) {
  const text = value.trim();
  if (!text || text === "—") return <span className={styles.missing}>—</span>;
  const tone = statusTone(text);
  if (!tone) return <CellValue value={text} />;
  return (
    <span className={[styles.badge, BADGE_TONE[tone], live ? styles.live : ""].filter(Boolean).join(" ")} title={text}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.badgeLabel}>{text}</span>
    </span>
  );
}

function ContactLine({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  className: string;
}) {
  const text = value.trim();
  return (
    <span className={`${styles.metaItem} ${className}`} title={text || undefined}>
      <Icon className={styles.metaIcon} aria-hidden />
      <span className="sr-only">{label}</span>
      {text ? <span className={styles.metaText}>{text}</span> : <span className={styles.missing}>—</span>}
    </span>
  );
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
  const filtered = Boolean(
    filters.q ||
      (filters.field && filters.field !== "name") ||
      filters.group ||
      filters.agent ||
      filters.agency ||
      filters.company ||
      filters.position,
  );

  return (
    <ListingShell
      title="Candidates"
      description={listingDescription("candidates", "Candidates")}
      count={listingCountLabel("Candidates", from, to, total)}
      action={
        canCreate ? (
          <Link href={`/records/candidates${queryString(filters, page)}${queryString(filters, page) ? "&" : "?"}create=1`} scroll={false} className="listing-cta">
            <Plus className="h-4 w-4" />
            {addLabel("Candidates")}
          </Link>
        ) : null
      }
      toolbar={
        <form className="listing-toolbar" action="/records/candidates">
          <label className="listing-search">
            <span className="sr-only">Search</span>
            <Search className="listing-search-icon" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Name, code, passport, mobile, email"
              className="listing-field"
            />
          </label>
          <label className="listing-select">
            <span className="sr-only">Search field</span>
            <select name="field" defaultValue={filters.field || "name"} className="listing-field" aria-label="Search field">
              <option value="code">Code</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="mobile">Mobile</option>
              <option value="passport_no">Passport No</option>
              <option value="status">Status</option>
            </select>
          </label>
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
          <button type="submit" className="listing-btn">
            Search
          </button>
          {filtered ? (
            <Link href="/records/candidates" className="listing-clear">
              Clear all
            </Link>
          ) : null}
        </form>
      }
      footer={
        <ListingPager
          page={page}
          pages={pages}
          previousHref={page > 1 ? `/records/candidates${queryString(filters, page - 1)}` : null}
          nextHref={page < pages ? `/records/candidates${queryString(filters, page + 1)}` : null}
        />
      }
    >
      <table className={`listing-table ${styles.table}`}>
        <colgroup>
          {COLUMNS.map(([label, column]) => (
            <col key={label} className={column} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map(([label]) => (
              <th key={label} scope="col" title={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="listing-empty-cell" colSpan={COLUMNS.length}>
                <p className="text-[13px] font-medium text-[var(--listing-muted)]">No candidates found</p>
                <p className="mt-1 text-[12px] text-[var(--listing-faint)]">
                  {filters.q ? "Try adjusting your search terms." : "No candidates match your current filters."}
                </p>
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={styles.candidate}>
                <div className={styles.profile}>
                  <Portrait path={row.photo} name={row.name} className={styles.avatar} />
                  <div className={styles.profileBody}>
                    <Link href={`/records/candidates/${row.id}`} className={styles.identity}>
                      <span className={styles.name} title={row.name || undefined}>
                        {row.name || "—"}
                      </span>
                      <span className={styles.code}>{row.code || row.id}</span>
                    </Link>
                    <div className={styles.meta}>
                      <ContactLine icon={Mail} label="Email" value={row.email} className={styles.metaEmail} />
                      <span className={styles.metaRule} aria-hidden />
                      <ContactLine icon={Phone} label="Mobile" value={row.mobile} className={styles.metaPhone} />
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <CellValue value={row.passportNo} mono />
              </td>
              <td>
                <BoardBadge value={statusLabel(row.status) || row.status || "—"} />
              </td>
              <td>
                <CellValue value={row.agentLabel} lines={2} />
              </td>
              <td>
                <CellValue value={row.groupLabel} lines={2} />
              </td>
              <td>
                <CellValue value={row.agencyName} lines={2} />
              </td>
              <td>
                <CellValue value={row.companyName} lines={2} />
              </td>
              <td>
                <CellValue value={row.licensePosition} lines={2} />
              </td>
              <td>
                <BoardBadge value={row.companyStatus || "—"} />
              </td>
              <td>
                <CellValue value={row.arcNo} mono />
              </td>
              <td>
                <CellValue value={row.visaMp} mono />
              </td>
              <td>
                <CellValue value={row.labourExpire} mono />
              </td>
              <td>
                <BoardBadge value={row.liveStatus || "—"} live />
              </td>
              <td>
                <BoardBadge value={row.paymentLabel || "—"} />
              </td>
              <td className="listing-actions-cell">
                <RowActions
                  slug="candidates"
                  id={row.id}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  appearance="icons"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListingShell>
  );
}
