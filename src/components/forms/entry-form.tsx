"use client";

import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { ActionState } from "@/app/(workspace)/records/actions";
import { Button } from "@/components/ui/button";

type Field = {
  name: string;
  label: string;
  type?: string;
  options?: string[];
};

export function EntryForm({
  schema,
  fields,
  action,
  hidden,
  submitLabel,
}: {
  schema: z.ZodTypeAny;
  fields: Field[];
  action: (state: ActionState | undefined, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const form = useForm<Record<string, string>>();

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={form.handleSubmit((values) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0] ?? "");
            if (key) form.setError(key, { message: issue.message });
          }
          return;
        }
        const data = new FormData();
        for (const [key, value] of Object.entries(hidden ?? {})) data.set(key, value);
        const output = parsed.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(output)) {
          if (value != null) data.set(key, String(value));
        }
        startTransition(() => {
          submit(data);
        });
      })}
    >
      {fields.map((field) => (
        <label key={field.name} className="grid gap-1 text-sm">
          <span className="font-medium">{field.label}</span>
          {field.options ? (
            <select className="control" {...form.register(field.name)}>
              <option value="">Select</option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type ?? "text"}
              className="control"
              {...form.register(field.name)}
            />
          )}
          {form.formState.errors[field.name] ? (
            <span className="text-xs text-red-600">{String(form.formState.errors[field.name]?.message ?? "Invalid value")}</span>
          ) : null}
        </label>
      ))}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
