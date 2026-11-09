"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { deleteBreadFormAction } from "@/app/(workspace)/records/actions";

export function RowActions({
  slug,
  id,
  canEdit,
  canDelete,
  canView = true,
  extra = [],
  appearance = "labels",
}: {
  slug: string;
  id: number;
  canEdit: boolean;
  canDelete: boolean;
  canView?: boolean;
  extra?: Array<{ href: string; label: string }>;
  appearance?: "labels" | "icons";
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const editHref = (() => {
    if (slug === "candidates" || slug === "candidate") return `/records/candidates/${id}`;
    const params = new URLSearchParams(search.toString());
    params.delete("create");
    params.delete("error");
    params.delete("invoice");
    params.set("edit", String(id));
    return `${pathname}?${params.toString()}`;
  })();
  const icons = appearance === "icons";
  const viewClass = icons
    ? "listing-icon-btn"
    : "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground";
  const extraClass = icons
    ? "listing-btn listing-btn-sm"
    : "inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground";
  const deleteClass = icons
    ? "listing-icon-btn listing-icon-btn-danger"
    : "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 dark:hover:border-red-900 dark:hover:bg-red-950/40";

  return (
    <div className={icons ? "listing-row-actions" : "flex items-center gap-1"}>
      {canView ? (
        <Link href={`/records/${slug}/${id}`} className={viewClass} aria-label="View" title="View">
          <Eye className="h-3.5 w-3.5" />
          {icons ? <span className="sr-only">View</span> : <span>View</span>}
        </Link>
      ) : null}

      {canEdit ? (
        <Link href={editHref} scroll={false} className={viewClass} aria-label="Edit" title="Edit">
          <Pencil className="h-3.5 w-3.5" />
          {icons ? <span className="sr-only">Edit</span> : <span>Edit</span>}
        </Link>
      ) : null}

      {extra.map((item) => (
        <Link key={item.label} href={item.href} className={extraClass}>
          {item.label}
        </Link>
      ))}

      {canDelete ? (
        <form action={deleteBreadFormAction} className="inline-flex">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className={deleteClass}
            aria-label="Delete"
            title="Delete"
            onClick={(event) => {
              if (!window.confirm("Are you sure you want to delete this?")) event.preventDefault();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {icons ? <span className="sr-only">Delete</span> : <span>Delete</span>}
          </button>
        </form>
      ) : null}
    </div>
  );
}
