import { notFound, redirect } from "next/navigation";
import { BreadForm } from "@/components/records/bread-form";
import { loadBreadForm } from "@/server/bread-form";
import { requireUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function EditRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ error?: string; stamp?: string }>;
}) {
  const { resource: slug, id } = await params;
  const query = await searchParams;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();
  if (slug === "candidates") redirect(`/records/candidates/${numericId}${query.stamp === "Y" ? "?stamp=Y" : ""}${query.error ? `${query.stamp === "Y" ? "&" : "?"}error=${encodeURIComponent(query.error)}` : ""}`);
  const user = await requireUser();
  const form = await loadBreadForm(slug, "edit", numericId, user);
  if (!form || form.fields.length === 0) notFound();
  return (
    <div className="space-y-3">
      {query.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{query.error}</p> : null}
      <BreadForm slug={form.slug} id={numericId} title={form.title} fields={form.fields} backHref={`/records/${form.slug}/${numericId}`} />
    </div>
  );
}
