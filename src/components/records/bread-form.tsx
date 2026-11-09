import { ArrowLeft, Briefcase, CircleDot, ClipboardList, FileText, IdCard, KeyRound, Layers, MapPin, Phone, Ruler, Upload, UserRound, type LucideIcon } from "lucide-react";
import { FileValue } from "@/components/media/file-value";
import { DigitPhoneInput } from "@/components/records/digit-phone-input";
import { arrangeCandidateFields } from "@/components/records/candidate-sections";
import { EmployerForm } from "@/components/records/employer-form";
import { FormModal } from "@/components/records/form-modal";
import { arrangeRecordFields, recordSectionCopy } from "@/components/records/form-sections";
import { RecordSaveButton } from "@/components/records/record-save-button";
import { RoleSelect } from "@/components/records/role-select";
import { UserAccountForm } from "@/components/records/user-account-form";
import { acceptedIdempotencyKey } from "@/lib/payment-idempotency";
import { readBreadFormTarget, submitBreadForm, type FormField } from "@/server/bread-form";
import { requestIp, requireUser } from "@/server/current-user";
import { redirect, unstable_rethrow } from "next/navigation";

const LONG_LIST = 8;

const CANDIDATE_SECTION_ICONS: Record<string, LucideIcon> = {
  basic: UserRound,
  identity: IdCard,
  contact: Phone,
  documents: FileText,
  address: MapPin,
  relations: Briefcase,
  experience: ClipboardList,
  physical: Ruler,
  access: KeyRound,
  status: CircleDot,
  details: Layers,
};

function isCandidateCreate(slug: string, id?: number): boolean {
  return id == null && (slug === "candidates" || slug === "candidate");
}

function FormSections({
  slug,
  isEdit,
  rich = false,
  sections,
}: {
  slug: string;
  isEdit: boolean;
  rich?: boolean;
  sections: Array<{
    key: string;
    title: string;
    description: string;
    documents: boolean;
    items: Array<{ field: FormField; index: number }>;
  }>;
}) {
  return sections.map((section) => {
    const Icon = rich ? CANDIDATE_SECTION_ICONS[section.key] : undefined;
    return (
      <section key={section.key} className="record-section" data-accent={rich ? section.key : undefined}>
        {Icon ? (
          <div className="record-section-heading">
            <span className="record-section-icon">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="record-section-title">{section.title}</h2>
          </div>
        ) : (
          <h2 className="record-section-title">{section.title}</h2>
        )}
        <p className="record-section-copy">{section.description}</p>
        <div className="record-grid">
          {section.items.map(({ field, index }) => (
            <RecordField key={`${field.name}-${index}`} slug={slug} field={field} isEdit={isEdit} fileInGrid={section.documents} richFile={rich} />
          ))}
        </div>
      </section>
    );
  });
}

function isUsersRoleSelect(slug: string, field: FormField): boolean {
  return slug === "users" && field.name === "role_id" && field.input === "select";
}

function fieldControlId(slug: string, field: FormField): string {
  return `field-${isUsersRoleSelect(slug, field) ? "role_id" : field.name}`;
}

function searchableSelect(field: FormField): boolean {
  return field.input === "select" && (field.name === "role_id" || field.options.length >= LONG_LIST);
}

function RecordField({
  slug,
  field,
  isEdit,
  fileInGrid = false,
  richFile = false,
}: {
  slug: string;
  field: FormField;
  isEdit: boolean;
  fileInGrid?: boolean;
  richFile?: boolean;
}) {
  const id = fieldControlId(slug, field);
  const wide = field.input === "textarea" || (field.input === "file" && !fileInGrid);

  return (
    <div className={wide ? "record-span" : undefined}>
      <label htmlFor={id} className="record-label">
        {field.label}
        {field.required ? (
          <span className="record-required" aria-label="required">
            {" "}
            *
          </span>
        ) : null}
      </label>

      {field.input === "textarea" ? (
        <textarea id={id} name={field.name} defaultValue={field.value} required={field.required} rows={4} className="control" />
      ) : null}

      {field.input === "select" && searchableSelect(field) ? (
        <RoleSelect
          id={id}
          name={field.name}
          options={field.options}
          defaultValue={field.value}
          required={field.required}
          emptyLabel={field.required ? "Select an option" : "— None —"}
          searchPlaceholder={`Search ${field.label.toLowerCase()}`}
          listLabel={field.label}
          emptyMessage={`No matching ${field.label.toLowerCase()}`}
          tone="brand"
        />
      ) : null}

      {field.input === "select" && !searchableSelect(field) ? (
        <select id={id} name={field.name} defaultValue={field.value} required={field.required} className="control">
          <option value="">{field.required ? "Select an option" : "— None —"}</option>
          {field.options.map((option) => (
            <option key={`${field.name}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {field.input === "checkbox" ? (
        <div className="record-check">
          <input
            id={id}
            type="checkbox"
            name={field.name}
            value="1"
            defaultChecked={field.value === "1" || field.value === "true" || field.value === "on"}
            className="h-4 w-4 rounded accent-[var(--rc-red)]"
          />
          <span>Enable</span>
        </div>
      ) : null}

      {field.input === "file" ? (
        <div className={richFile ? "record-file candidate-drop" : "record-file"}>
          {field.value ? (
            <div className="mb-3">
              <FileValue value={field.value} className="h-28 w-24 rounded-lg object-cover" />
            </div>
          ) : null}
          {richFile ? (
            <span className="candidate-drop-mark" aria-hidden="true">
              <Upload className="h-4 w-4" />
            </span>
          ) : null}
          <input
            id={id}
            type="file"
            name={field.name}
            accept={field.accept === null ? undefined : field.accept ?? "image/jpeg,image/png,image/webp,application/pdf"}
            className="text-[12.5px] text-[var(--rc-heading)] file:mr-3 file:rounded-md file:border file:border-[var(--rc-line)] file:bg-[var(--rc-card)] file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-[var(--rc-heading)]"
          />
          {richFile && field.accept !== null ? <p className="candidate-drop-note">{field.accept === "image/*" ? "Image files" : "JPG, PNG, WEBP, or PDF"}</p> : null}
        </div>
      ) : null}

      {field.input !== "textarea" && field.input !== "select" && field.input !== "checkbox" && field.input !== "file" ? (
        field.maxLength != null && field.name.endsWith("mobile") ? (
          <DigitPhoneInput id={id} name={field.name} defaultValue={field.value} required={field.required} maxLength={field.maxLength} />
        ) : (
          <input id={id} type={field.input} name={field.name} defaultValue={field.value} placeholder={field.placeholder} required={field.required} readOnly={field.readOnly} maxLength={field.maxLength} className="control" />
        )
      ) : null}

      {field.input === "password" && isEdit && !field.required ? (
        <p className="record-hint">Leave this blank to keep the current password.</p>
      ) : null}
    </div>
  );
}

export function BreadForm({
  slug,
  id,
  title,
  fields,
  backHref,
  heading,
  stamp = false,
  embedded = false,
  modal = false,
  error,
}: {
  slug: string;
  id?: number;
  title: string;
  fields: FormField[];
  backHref: string;
  heading?: string;
  stamp?: boolean;
  embedded?: boolean;
  modal?: boolean;
  error?: string;
}) {
  if (slug === "employers" || slug === "employer") {
    return (
      <EmployerForm
        slug={slug}
        id={id}
        title={title}
        fields={fields}
        backHref={backHref}
        action={saveBreadFormAction}
        error={error}
        modal={modal || !embedded}
      />
    );
  }
  if (slug === "users") {
    return (
      <UserAccountForm
        slug={slug}
        id={id}
        title={title}
        fields={fields}
        backHref={backHref}
        heading={heading}
        stamp={stamp}
        action={saveBreadFormAction}
        error={error}
        modal={modal || !embedded}
      />
    );
  }
  const isEdit = id != null;
  const pageHeading = heading ?? (isEdit ? `Edit ${title}` : `Add ${title}`);
  const pageSub = heading ? "Candidate file" : isEdit ? "Edit record" : "New record";
  const description = isEdit ? `Update the ${title.toLowerCase()} details and save when you are finished.` : `Fill in the details to add a new ${title.toLowerCase()}.`;
  const creatingCandidate = isCandidateCreate(slug, id);
  const candidateArrangement = creatingCandidate ? arrangeCandidateFields(fields) : null;
  const genericArrangement = creatingCandidate ? null : arrangeRecordFields(fields);
  const hidden = (candidateArrangement ?? genericArrangement)!.hidden;
  const sections = candidateArrangement
    ? candidateArrangement.sections.map((section) => ({
        key: section.key,
        title: section.title,
        description: section.description,
        documents: section.key === "documents",
        items: section.items,
      }))
    : genericArrangement!.sections.map((section) => ({
        key: section.key,
        documents: false,
        items: section.items,
        ...recordSectionCopy(section.key),
      }));
  const saveButton = creatingCandidate ? <RecordSaveButton /> : <button type="submit" className="record-save">Save</button>;

  const sheet = (
    <>
      <header className="record-header">
        <div className="min-w-0">
          <p className="record-kicker">{pageSub}</p>
          <h1 className="record-title">{pageHeading}</h1>
          <p className="record-lead">{description}</p>
        </div>
        <a href={backHref} className="listing-btn">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </a>
      </header>
      {error ? <p className="record-alert">{error}</p> : null}
      <form action={saveBreadFormAction} className={creatingCandidate ? "record-card candidate-create" : "record-card"}>
        <input type="hidden" name="slug" value={slug} />
        {id != null ? <input type="hidden" name="id" value={id} /> : null}
        {stamp ? <input type="hidden" name="stamp" value="Y" /> : null}
        {hidden.map(({ field, index }) => (
          <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
        ))}
        <div className="record-card-body">
          <FormSections slug={slug} isEdit={isEdit} rich={creatingCandidate} sections={sections} />
        </div>
        <div className="record-footer">
          <a href={backHref} className="listing-btn">
            Cancel
          </a>
          {saveButton}
        </div>
      </form>
    </>
  );

  if (embedded) return sheet;
  if (!modal) return <section className="record-canvas">{sheet}</section>;

  return (
    <FormModal title={pageHeading} description={description} closeHref={backHref} panelClassName={creatingCandidate ? "candidate-create" : undefined}>
      <form action={saveBreadFormAction} className="form-modal-form">
        <input type="hidden" name="slug" value={slug} />
        {id != null ? <input type="hidden" name="id" value={id} /> : null}
        {stamp ? <input type="hidden" name="stamp" value="Y" /> : null}
        {hidden.map(({ field, index }) => (
          <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
        ))}
        <div className="form-modal-body">
          {error ? (
            <p className="record-alert form-modal-alert" role="alert">
              {error}
            </p>
          ) : null}
          <FormSections slug={slug} isEdit={isEdit} rich={creatingCandidate} sections={sections} />
        </div>
        <div className="form-modal-footer">
          <a href={backHref} className="listing-btn">
            Cancel
          </a>
          {saveButton}
        </div>
      </form>
    </FormModal>
  );
}

export async function saveBreadFormAction(formData: FormData): Promise<void> {
  "use server";
  const user = await requireUser();
  const { slug, id, stamp } = readBreadFormTarget(formData);
  try {
    const saved = await submitBreadForm(user, formData, await requestIp());
    redirect(`/records/${slug}/${saved}${stamp ? "?stamp=Y" : ""}`);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not save.";
    const target = id == null ? `/records/${slug}/new` : `/records/${slug}/${id}`;
    const idempotencyKey = acceptedIdempotencyKey(String(formData.get("idempotency_key") ?? ""));
    redirect(`${target}?error=${encodeURIComponent(message)}${stamp ? "&stamp=Y" : ""}${idempotencyKey ? `&idempotency_key=${idempotencyKey}` : ""}`);
  }
}
