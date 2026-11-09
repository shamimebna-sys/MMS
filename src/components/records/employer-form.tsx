import { FileDropField } from "@/components/records/file-drop-field";
import { FormModal } from "@/components/records/form-modal";
import { arrangeEmployerFields } from "@/components/records/employer-sections";
import { RoleSelect } from "@/components/records/role-select";
import type { FormField } from "@/server/bread-form";

const LONG_LIST = 8;

function fieldId(name: string): string {
  return `field-${name}`;
}

function spansFull(field: FormField): boolean {
  return field.input === "textarea" || field.name.includes("address");
}

function EmployerField({ field, isEdit }: { field: FormField; isEdit: boolean }) {
  const id = fieldId(field.name);
  const searchable = field.input === "select" && field.options.length >= LONG_LIST;

  return (
    <div className={spansFull(field) ? "record-span" : undefined}>
      <label htmlFor={id} className="record-label">
        {field.label}
        {field.required ? (
          <span className="record-required" aria-label="required">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {field.input === "file" ? <FileDropField id={id} name={field.name} value={field.value} /> : null}
      {field.input === "textarea" ? (
        <textarea id={id} name={field.name} defaultValue={field.value} required={field.required} rows={3} className="control" />
      ) : null}
      {field.input === "select" && searchable ? (
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
      {field.input !== "textarea" && field.input !== "select" && field.input !== "checkbox" && field.input !== "file" ? (
        <input id={id} type={field.input} name={field.name} defaultValue={field.value} required={field.required} className="control" />
      ) : null}
      {field.input === "password" && isEdit && !field.required ? (
        <p className="record-hint">Leave this blank to keep the current password.</p>
      ) : null}
    </div>
  );
}

export function EmployerForm({
  slug,
  id,
  title,
  fields,
  backHref,
  action,
  error,
  modal = false,
}: {
  slug: string;
  id?: number;
  title: string;
  fields: FormField[];
  backHref: string;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  modal?: boolean;
}) {
  const isEdit = id != null;
  const { hidden, sections } = arrangeEmployerFields(fields);
  const heading = isEdit ? `Edit ${title}` : `Add ${title}`;
  const description = isEdit
    ? `Update the ${title.toLowerCase()} details and save when you are finished.`
    : `Fill in the details to register a new ${title.toLowerCase()}.`;

  const form = (
    <form action={action} className={modal ? "form-modal-form" : "flex max-h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-xl border border-[var(--rc-line)] bg-[var(--rc-card)] shadow-[0_1px_2px_rgb(17_24_39/0.04),0_16px_40px_rgb(17_24_39/0.06)]"}>
      <input type="hidden" name="slug" value={slug} />
      {id != null ? <input type="hidden" name="id" value={id} /> : null}
      {hidden.map(({ field, index }) => (
        <input key={`${field.name}-${index}`} type="hidden" name={field.name} value={field.value} />
      ))}
      <div className={modal ? "form-modal-body" : "min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6"}>
        {error ? <p className="record-alert form-modal-alert">{error}</p> : null}
        {sections.map((section) => (
          <section key={section.key} className="record-section">
            <h2 className="record-section-title">{section.title}</h2>
            <p className="record-section-copy">{section.description}</p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map(({ field, index }) => (
                <EmployerField key={`${field.name}-${index}`} field={field} isEdit={isEdit} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className={modal ? "form-modal-footer" : "flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rc-line)] bg-[var(--rc-card)] px-5 py-3.5 md:px-6"}>
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
      <FormModal title={heading} description={description} closeHref={backHref}>
        {form}
      </FormModal>
    );
  }

  return (
    <section className="record-canvas">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 self-center">
        <header className="record-header">
          <div className="min-w-0">
            <p className="record-kicker">{isEdit ? "Edit record" : "New record"}</p>
            <h1 className="record-title">{heading}</h1>
            <p className="record-lead">{description}</p>
          </div>
        </header>
        {form}
      </div>
    </section>
  );
}
