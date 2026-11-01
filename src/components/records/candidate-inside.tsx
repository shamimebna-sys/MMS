import { FileValue } from "@/components/media/file-value";
import { BreadForm } from "@/components/records/bread-form";
import { CandidateFile } from "@/components/records/candidate-file";
import { canMutateTable } from "@/lib/auth/permissions";
import { loadBreadForm } from "@/server/bread-form";
import { loadCandidateFile, presentCandidateFields } from "@/server/candidate-file";
import { requireUser } from "@/server/current-user";

export async function CandidateInside({ id, stamp, error }: { id: number; stamp: boolean; error?: string }) {
  const user = await requireUser();
  const file = await loadCandidateFile(user, id);
  if (!file) return <p className="text-sm text-muted">You do not have access to this candidate.</p>;
  const form = await loadBreadForm("candidates", "edit", id, user);
  const fields = presentCandidateFields(form?.fields ?? [], stamp);
  const canEdit = canMutateTable(user, "candidates", "edit");
  return (
    <div className="space-y-5">
      <CandidateFile file={file} step={stamp ? 2 : 1} />
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {canEdit && fields.length > 0 ? (
        <BreadForm
          slug="candidates"
          id={id}
          title="Candidate"
          fields={fields}
          backHref="/records/candidates"
          heading="Basic information"
          stamp={stamp}
        />
      ) : (
        <section className="surface grid gap-px overflow-hidden md:grid-cols-2">
          {fields.filter((field) => field.input !== "hidden" && field.input !== "password").map((field) => (
            <div key={field.name} className={`bg-card px-5 py-4 ${field.input === "textarea" ? "md:col-span-2" : ""}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{field.label}</p>
              <div className="mt-1.5 text-sm">
                <FileValue
                  value={field.input === "select" ? field.options.find((option) => option.value === field.value)?.label || field.value : field.value}
                  className="h-28 w-24 rounded-xl object-cover"
                />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
