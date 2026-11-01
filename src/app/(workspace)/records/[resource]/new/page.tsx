import Link from "next/link";
import { BreadForm } from "@/components/records/bread-form";
import { CandidateFile } from "@/components/records/candidate-file";
import { loadBreadForm, shapeAgentCandidateForm, type FormField } from "@/server/bread-form";
import { CANDIDATE_STEP_BY_SLUG, loadCandidateFile } from "@/server/candidate-file";
import { requireUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

function preset(fields: FormField[], name: string, raw: string | undefined) {
  if (!raw || !/^\d+$/.test(raw)) return;
  const existing = fields.find((field) => field.name === name);
  if (existing) {
    existing.value = raw;
    existing.input = "hidden";
    return;
  }
  fields.push({ name, label: name, input: "hidden", required: false, multiple: false, options: [], value: raw });
}

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ error?: string; invoice?: string; candidate?: string }>;
}) {
  const { resource: slug } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const form = await loadBreadForm(slug, "add", null, user);
  if (form) {
    preset(form.fields, "invoice_id", query.invoice);
    preset(form.fields, "candidate_id", query.candidate);
  }
  if (form && (user.roleName === "Agent" || user.roleName === "Sub Agent") && (slug === "candidates" || slug === "candidate")) {
    form.fields = shapeAgentCandidateForm(form.fields);
  }
  if (!form || form.fields.length === 0) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Add</h1>
        <p className="text-sm text-muted">This module has no fields that can be added.</p>
        <Link href={`/records/${slug}`} className="text-sm text-accent">
          Back
        </Link>
      </section>
    );
  }
  const step = CANDIDATE_STEP_BY_SLUG[form.slug];
  const candidateId = /^\d+$/.test(query.candidate ?? "") ? Number(query.candidate) : 0;
  const file = step && candidateId ? await loadCandidateFile(user, candidateId) : null;
  return (
    <div className="space-y-5">
      {file && step ? <CandidateFile file={file} step={step} /> : null}
      {query.error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{query.error}</p> : null}
      <BreadForm slug={form.slug} title={form.title} fields={form.fields} backHref={file ? `/records/candidates/${file.id}` : `/records/${form.slug}`} />
    </div>
  );
}
