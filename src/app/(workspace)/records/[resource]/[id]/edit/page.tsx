import { notFound, redirect } from "next/navigation";

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
  if (slug === "candidates") {
    redirect(`/records/candidates/${numericId}${query.stamp === "Y" ? "?stamp=Y" : ""}${query.error ? `${query.stamp === "Y" ? "&" : "?"}error=${encodeURIComponent(query.error)}` : ""}`);
  }
  const next = new URLSearchParams();
  next.set("edit", String(numericId));
  if (query.error) next.set("error", query.error);
  redirect(`/records/${slug}/${numericId}?${next.toString()}`);
}
