import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { FileValue } from "@/components/media/file-value";
import { saveBreadRecord, type FormField } from "@/server/bread-form";
import { requestIp, requireUser } from "@/server/current-user";
import { storeUpload } from "@/server/uploads";

export function BreadForm({
  slug,
  id,
  title,
  fields,
  backHref,
  heading,
  stamp = false,
}: {
  slug: string;
  id?: number;
  title: string;
  fields: FormField[];
  backHref: string;
  heading?: string;
  stamp?: boolean;
}) {
  const isEdit = id != null;
  const pageHeading = heading ?? (isEdit ? `Edit ${title}` : `Add ${title}`);
  const pageSub = heading ? "Candidate file" : isEdit ? "Edit record" : "New record";

  return (
    <section className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{pageSub}</p>
          <h1 className="page-title mt-1">{pageHeading}</h1>
        </div>
        <a href={backHref} className="btn-quiet inline-flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </a>
      </div>

      {/* Form card */}
      <form action={saveBreadFormAction} className="surface max-w-5xl p-5 md:p-7">
        <input type="hidden" name="slug" value={slug} />
        {id != null ? <input type="hidden" name="id" value={id} /> : null}
        {stamp ? <input type="hidden" name="stamp" value="Y" /> : null}

        <div className="grid gap-5 md:grid-cols-2">
          {fields.map((field) =>
            field.input === "hidden" ? (
              <input key={field.name} type="hidden" name={field.name} value={field.value} />
            ) : (
              <div
                key={field.name}
                className={`grid gap-1.5 ${field.input === "textarea" ? "md:col-span-2" : ""}`}
              >
                <label htmlFor={`field-${field.name}`} className="text-[12.5px] font-medium text-foreground">
                  {field.label}
                  {field.required ? (
                    <span className="ml-0.5 text-accent" aria-label="required">
                      {" "}*
                    </span>
                  ) : null}
                </label>

                {field.input === "textarea" ? (
                  <textarea
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={field.value}
                    required={field.required}
                    rows={4}
                    className="control"
                  />
                ) : null}

                {field.input === "select" ? (
                  <select
                    id={`field-${field.name}`}
                    name={field.name}
                    defaultValue={field.value}
                    required={field.required}
                    className="control"
                  >
                    <option value="">{field.required ? "Select an option" : "— None —"}</option>
                    {field.options.map((option) => (
                      <option key={`${field.name}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : null}

                {field.input === "checkbox" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id={`field-${field.name}`}
                      type="checkbox"
                      name={field.name}
                      value="1"
                      defaultChecked={
                        field.value === "1" || field.value === "true" || field.value === "on"
                      }
                      className="h-4 w-4 rounded accent-[var(--accent)]"
                    />
                    <span className="text-[12.5px] text-muted">Enable</span>
                  </div>
                ) : null}

                {field.input === "file" ? (
                  <div className="rounded-xl border border-dashed border-border bg-background px-4 py-4">
                    {field.value ? (
                      <div className="mb-3">
                        <FileValue value={field.value} className="h-28 w-24 rounded-xl object-cover" />
                      </div>
                    ) : null}
                    <input
                      id={`field-${field.name}`}
                      type="file"
                      name={field.name}
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="text-[12.5px] text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-foreground hover:file:bg-background"
                    />
                  </div>
                ) : null}

                {field.input !== "textarea" &&
                  field.input !== "select" &&
                  field.input !== "checkbox" &&
                  field.input !== "file" ? (
                  <input
                    id={`field-${field.name}`}
                    type={field.input}
                    name={field.name}
                    defaultValue={field.value}
                    required={field.required}
                    className="control"
                  />
                ) : null}
              </div>
            ),
          )}
        </div>

        {/* Form actions */}
        <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
          <button type="submit" className="btn-primary">
            Save changes
          </button>
          <a href={backHref} className="btn-quiet">
            Cancel
          </a>
        </div>
      </form>
    </section>
  );
}

async function saveBreadFormAction(formData: FormData): Promise<void> {
  "use server";
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const rawId = String(formData.get("id") ?? "");
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;
  const incoming: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "slug" || key === "id") continue;
    if (typeof value === "string") incoming[key] = value;
    if (value instanceof File && value.size > 0) {
      const stored = await storeUpload({
        bytes: Buffer.from(await value.arrayBuffer()),
        originalName: value.name,
        ownerTable: slug,
        ownerId: id == null ? undefined : String(id),
        createdBy: user.id,
      });
      incoming[key] = `/api/files/${stored.id}`;
    }
  }
  let saved = 0;
  try {
    saved = await saveBreadRecord(user, slug, id, incoming, await requestIp());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save.";
    const stampQuery = String(formData.get("stamp") ?? "") === "Y" ? "&stamp=Y" : "";
    const target = id == null ? `/records/${slug}/new` : `/records/${slug}/${id}`;
    redirect(`${target}?error=${encodeURIComponent(message)}${stampQuery}`);
  }
  const stampQuery = String(formData.get("stamp") ?? "") === "Y" ? "?stamp=Y" : "";
  redirect(`/records/${slug}/${saved}${stampQuery}`);
}
