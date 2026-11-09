import { FormModal } from "@/components/records/form-modal";
import { BreadForm } from "@/components/records/bread-form";
import { keepIdempotencyKey } from "@/lib/payment-idempotency";
import { alignCandidateCreateFields } from "@/components/records/candidate-sections";
import { loadBreadForm, type FormField } from "@/server/bread-form";
import { requireUser } from "@/server/current-user";

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

function hide(fields: FormField[], name: string, raw: string) {
  const existing = fields.find((field) => field.name === name);
  if (existing) {
    existing.value = raw;
    existing.input = "hidden";
    return;
  }
  fields.push({ name, label: name, input: "hidden", required: false, multiple: false, options: [], value: raw });
}

export async function RecordComposer({
  slug,
  mode,
  id,
  invoice,
  ticketInvoice,
  candidate,
  idempotencyKey,
  error,
  closeHref,
}: {
  slug: string;
  mode: "add" | "edit";
  id?: number;
  invoice?: string;
  ticketInvoice?: string;
  candidate?: string;
  idempotencyKey?: string;
  error?: string;
  closeHref: string;
}) {
  if (mode === "edit" && (slug === "candidates" || slug === "candidate")) return null;
  const user = await requireUser();
  const form = await loadBreadForm(slug, mode, mode === "edit" ? (id ?? null) : null, user);
  if (form && mode === "add") {
    preset(form.fields, "invoice_id", invoice);
    preset(form.fields, "ticket_invoice_id", ticketInvoice);
    preset(form.fields, "candidate_id", candidate);
    if (slug === "payments" || slug === "payment") hide(form.fields, "idempotency_key", keepIdempotencyKey(idempotencyKey));
  }
  if (form && mode === "add" && (slug === "candidates" || slug === "candidate")) {
    form.fields = alignCandidateCreateFields(form.fields);
  }
  const isEdit = mode === "edit";
  const title = form?.title ?? "Record";
  if (!form || form.fields.length === 0) {
    return (
      <FormModal
        title={isEdit ? `Edit ${title}` : `Add ${title}`}
        description={isEdit ? "This record has no fields that can be edited." : "This module has no fields that can be added."}
        closeHref={closeHref}
      >
        <div className="form-modal-form">
          <div className="form-modal-body">
            <p className="text-[13px] text-[var(--rc-muted)]">
              {isEdit ? "This record has no fields that can be edited." : "This module has no fields that can be added."}
            </p>
          </div>
          <div className="form-modal-footer">
            <a href={closeHref} className="listing-btn">
              Close
            </a>
          </div>
        </div>
      </FormModal>
    );
  }
  return (
    <BreadForm
      slug={form.slug}
      id={isEdit ? id : undefined}
      title={form.title}
      fields={form.fields}
      backHref={closeHref}
      error={error}
      modal
    />
  );
}
