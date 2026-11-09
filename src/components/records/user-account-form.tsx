import { ArrowLeft } from "lucide-react";
import { FileValue } from "@/components/media/file-value";
import { FormModal } from "@/components/records/form-modal";
import { RoleSelect } from "@/components/records/role-select";
import { UserAvatarField } from "@/components/records/user-avatar-field";
import { arrangeUserFields, userSectionCopy, type UserFormSectionKey } from "@/components/records/user-account-sections";
import type { FormField } from "@/server/bread-form";

const LONG_LIST = 8;

function controlId(name: string, input: FormField["input"], index: number, seen: Map<string, number>): string {
  const base = name === "role_id" && input === "select" ? "field-role_id" : `field-${name}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${index}`;
}

function UserField({
  field,
  id,
  personName,
  isEdit,
}: {
  field: FormField;
  id: string;
  personName: string;
  isEdit: boolean;
}) {
  const wide = field.input === "textarea" || field.input === "file";
  const avatar = field.input === "file" && field.name === "avatar";
  const searchable = field.input === "select" && (field.name === "role_id" || field.options.length >= LONG_LIST);

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

      {field.input === "select" && searchable ? (
        <RoleSelect
          id={id}
          name={field.name}
          options={field.options}
          defaultValue={field.value}
          required={field.required}
          emptyLabel={field.required ? "Select an option" : "— None —"}
          searchPlaceholder={field.name === "role_id" ? "Search roles" : `Search ${field.label.toLowerCase()}`}
          listLabel={field.name === "role_id" ? "Roles" : field.label}
          emptyMessage={field.name === "role_id" ? "No matching roles" : `No matching ${field.label.toLowerCase()}`}
          tone="brand"
        />
      ) : null}

      {field.input === "select" && !searchable ? (
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

      {avatar ? <UserAvatarField id={id} name={field.name} value={field.value} personName={personName} /> : null}

      {field.input === "file" && !avatar ? (
        <div className="record-file">
          {field.value ? (
            <div className="mb-3">
              <FileValue value={field.value} className="h-28 w-24 rounded-lg object-cover" />
            </div>
          ) : null}
          <input
            id={id}
            type="file"
            name={field.name}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="text-[12.5px] text-[var(--rc-heading)] file:mr-3 file:rounded-md file:border file:border-[var(--rc-line)] file:bg-[var(--rc-card)] file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-[var(--rc-heading)]"
          />
        </div>
      ) : null}

      {field.input !== "textarea" && field.input !== "select" && field.input !== "checkbox" && field.input !== "file" ? (
        <input id={id} type={field.input} name={field.name} defaultValue={field.value} required={field.required} className="control" />
      ) : null}

      {field.input === "password" && isEdit && !field.required ? (
        <p className="record-hint">Leave this blank to keep the current password.</p>
      ) : null}
    </div>
  );
}

export function UserAccountForm({
  slug,
  id,
  title,
  fields,
  backHref,
  heading,
  stamp = false,
  action,
  error,
  modal = false,
}: {
  slug: string;
  id?: number;
  title: string;
  fields: FormField[];
  backHref: string;
  heading?: string;
  stamp?: boolean;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  modal?: boolean;
}) {
  const isEdit = id != null;
  const pageHeading = heading ?? (isEdit ? `Edit ${title}` : `Add ${title}`);
  const pageSub = heading ? "Candidate file" : "User account";
  const description = heading
    ? "Update the fields in this record."
    : isEdit
      ? "Update profile details, account access, and related records."
      : "Create an account with profile details, access, and related records.";
  const personName = fields.find((field) => field.name === "name")?.value ?? "";
  const { hidden, sections } = arrangeUserFields(fields);
  const seen = new Map<string, number>();

  const form = (
      <form action={action} className={modal ? "form-modal-form" : "record-card"}>
        <input type="hidden" name="slug" value={slug} />
        {id != null ? <input type="hidden" name="id" value={id} /> : null}
        {stamp ? <input type="hidden" name="stamp" value="Y" /> : null}
        {hidden.map(({ field, index }) => (
          <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
        ))}

        <div className={modal ? "form-modal-body" : "record-card-body"}>
          {modal && error ? <p className="record-alert form-modal-alert">{error}</p> : null}
          {sections.map((section) => {
            const copy = userSectionCopy(section.key as UserFormSectionKey);
            return (
              <section key={section.key} className="record-section">
                <h2 className="record-section-title">{copy.title}</h2>
                <p className="record-section-copy">{copy.description}</p>
                <div className="record-grid">
                  {section.items.map(({ field, index }) => (
                    <UserField
                      key={`${field.name}-${index}`}
                      field={field}
                      id={controlId(field.name, field.input, index, seen)}
                      personName={personName}
                      isEdit={isEdit}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className={modal ? "form-modal-footer" : "record-footer"}>
          <a href={backHref} className="listing-btn">
            Cancel
          </a>
          <button type="submit" className="record-save">
            Save
          </button>
        </div>
      </form>
  );

  if (modal) {
    return (
      <FormModal title={pageHeading} description={description} closeHref={backHref}>
        {form}
      </FormModal>
    );
  }

  return (
    <section className="record-canvas">
      <header className="record-header">
        <div className="min-w-0 max-w-2xl">
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
      {form}
    </section>
  );
}
