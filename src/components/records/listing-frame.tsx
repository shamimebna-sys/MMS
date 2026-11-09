import Link from "next/link";
import type { ReactNode } from "react";
import { statusTone } from "@/components/records/listing";

export function ListingShell({
  title,
  description,
  action,
  toolbar,
  count,
  footer,
  embedded = false,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  toolbar: ReactNode;
  count: ReactNode;
  footer?: ReactNode;
  embedded?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={embedded ? "listing listing-embedded" : "listing"}>
      <div className="listing-header">
        <div className="min-w-0">
          <h1 className="listing-title">{title}</h1>
          <p className="listing-desc">{description}</p>
        </div>
        {action ? <div className="listing-actions">{action}</div> : null}
      </div>
      {toolbar}
      <p className="listing-count">{count}</p>
      <div className="listing-table-wrap">
        {children}
        {footer ? <div className="listing-pager">{footer}</div> : null}
      </div>
    </section>
  );
}

export function StatusPill({ value }: { value: string }) {
  const text = value.trim();
  const tone = statusTone(text);
  if (!tone) return <span className="listing-muted-text">{text || "—"}</span>;
  return <span className={`listing-badge listing-badge-${tone}`}>{text}</span>;
}

export function ListingPager({
  page,
  pages,
  previousHref,
  nextHref,
}: {
  page: number;
  pages?: number | null;
  previousHref?: string | null;
  nextHref?: string | null;
}) {
  const known = pages != null && pages > 0;
  return (
    <>
      <span className="listing-pager-meta">{known ? `Page ${page} of ${pages}` : `Page ${page}`}</span>
      <div className="listing-pager-controls">
        {previousHref ? (
          <Link href={previousHref} className="listing-btn">
            Previous
          </Link>
        ) : null}
        <span className="listing-page-chip">{known ? `${page} / ${pages}` : page}</span>
        {nextHref ? (
          <Link href={nextHref} className="listing-btn">
            Next
          </Link>
        ) : null}
      </div>
    </>
  );
}
