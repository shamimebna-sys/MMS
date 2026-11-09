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
    <div className="record-canvas">
      <CandidateFile file={file} step={stamp ? 2 : 1} />
      {canEdit && fields.length > 0 ? (
        <BreadForm
          slug="candidates"
          id={id}
          title="Candidate"
          fields={fields}
          backHref="/records/candidates"
          heading={stamp ? "Passport With Stamp" : "Basic information"}
          stamp={stamp}
          embedded
          error={error}
        />
      ) : (
        <section className="record-card">
          <div className="record-card-body">
            <h2 className="record-section-title">{stamp ? "Passport With Stamp" : "Basic information"}</h2>
            <p className="record-section-copy">Values currently stored on this candidate.</p>
            <dl className="record-grid record-facts">
              {fields.filter((field) => field.input !== "hidden" && field.input !== "password").map((field) => (
                <div key={field.name} className={`record-fact ${field.input === "textarea" ? "record-span" : ""}`}>
                  <dt>{field.label}</dt>
                  <dd>
                    <FileValue
                      value={field.input === "select" ? field.options.find((option) => option.value === field.value)?.label || field.value : field.value}
                      className="h-28 w-24 rounded-lg object-cover"
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}
