import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateInside } from "@/components/records/candidate-inside";
import { FileValue } from "@/components/media/file-value";
import { RowActions } from "@/components/records/row-actions";
import { canMutateTable } from "@/lib/auth/permissions";
import { displayValue } from "@/lib/utils";
import { readBread } from "@/server/browse";
import { requireUser } from "@/server/current-user";
import { readRecord, resolveResource } from "@/server/resources";

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ stamp?: string; error?: string }>;
}) {
  const { resource: slug, id } = await params;
  const query = await searchParams;
  const resource = resolveResource(slug);
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();
  const user = await requireUser();
  let bread: Awaited<ReturnType<typeof readBread>> = null;
  try {
    bread = await readBread(user, slug, numericId);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("access")) throw error;
    return <p className="text-sm text-muted">You do not have access to this module.</p>;
  }
  let row: Record<string, unknown> | null = null;
  if (!bread && resource) {
    try {
      row = await readRecord(resource, user, numericId);
    } catch {
      return <p className="text-sm text-muted">You do not have access to this module.</p>;
    }
  }
  if (!bread && !row) notFound();
  const title = bread?.title ?? resource?.title ?? slug;
  const listSlug = bread?.slug ?? resource?.slug ?? slug;
  const isCandidate = resource?.slug === "candidates" || bread?.table === "candidates" || slug === "candidates";
  if (isCandidate) return <CandidateInside id={numericId} stamp={query.stamp === "Y"} error={query.error} />;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/records/${listSlug}`} className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            {title}
          </Link>
          <h1 className="page-title mt-1">
            {title} {numericId}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bread ? (
            <RowActions
              slug={listSlug}
              id={numericId}
              canEdit={canMutateTable(user, bread.table, "edit")}
              canDelete={canMutateTable(user, bread.table, "delete")}
            />
          ) : null}
          {resource ? (
            <Link href={`/api/exports/pdf?resource=${resource.slug}&id=${numericId}`} className="btn-quiet">
              PDF
            </Link>
          ) : null}
        </div>
      </div>
      <dl className="surface grid gap-px overflow-hidden sm:grid-cols-2">
        {bread
          ? bread.fields.map((field) => (
              <div key={field.label} className="bg-card px-5 py-4">
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{field.label}</dt>
                <dd className="mt-1.5 break-words text-sm">
                  <FileValue value={field.value} className="h-28 w-24 rounded-xl object-cover" />
                </dd>
              </div>
            ))
          : resource?.columns.map((column) => (
              <div key={column} className="bg-card px-5 py-4">
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{column}</dt>
                <dd className="mt-1.5 break-words text-sm">
                  <FileValue value={displayValue(row?.[column])} className="h-28 w-24 rounded-xl object-cover" />
                </dd>
              </div>
            ))}
      </dl>
    </section>
  );
}
