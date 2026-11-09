import { redirect } from "next/navigation";
import { acceptedIdempotencyKey } from "@/lib/payment-idempotency";

export const dynamic = "force-dynamic";

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ error?: string; invoice?: string; candidate?: string; idempotency_key?: string }>;
}) {
  const { resource: slug } = await params;
  const query = await searchParams;
  const next = new URLSearchParams();
  next.set("create", "1");
  if (query.invoice && /^\d+$/.test(query.invoice)) next.set("invoice", query.invoice);
  if (query.candidate && /^\d+$/.test(query.candidate)) next.set("candidate", query.candidate);
  if (query.error) next.set("error", query.error);
  const idempotencyKey = acceptedIdempotencyKey(query.idempotency_key);
  if (idempotencyKey) next.set("idempotency_key", idempotencyKey);
  redirect(`/records/${slug}?${next.toString()}`);
}
