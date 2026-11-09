"use client";

import { useFormStatus } from "react-dom";

export function RecordSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="record-save" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
