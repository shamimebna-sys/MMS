"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteBreadFormAction } from "@/app/(workspace)/records/actions";

export function RowActions({
  slug,
  id,
  canEdit,
  canDelete,
  extra = [],
}: {
  slug: string;
  id: number;
  canEdit: boolean;
  canDelete: boolean;
  extra?: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/records/${slug}/${id}`}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
      >
        <Eye className="h-3 w-3" />
        <span>View</span>
      </Link>

      {canEdit ? (
        <Link
          href={`/records/${slug}/${id}/edit`}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </Link>
      ) : null}

      {extra.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
        >
          {item.label}
        </Link>
      ))}

      {canDelete ? (
        <form action={deleteBreadFormAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 dark:hover:border-red-900 dark:hover:bg-red-950/40"
            onClick={(event) => {
              if (!window.confirm("Are you sure you want to delete this?")) event.preventDefault();
            }}
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete</span>
          </button>
        </form>
      ) : null}
    </div>
  );
}
