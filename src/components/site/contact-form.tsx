"use client";

import { useActionState } from "react";
import { contactAction } from "@/app/(site)/actions";

export function ContactForm() {
  const [state, action, pending] = useActionState(contactAction, { message: "" });
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium">
        Name
        <input name="name" required className="h-12 rounded-2xl border border-slate-200 px-4" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Email
        <input name="email" type="email" required className="h-12 rounded-2xl border border-slate-200 px-4" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Message
        <textarea name="message" required minLength={8} rows={5} className="rounded-2xl border border-slate-200 px-4 py-3" />
      </label>
      <button type="submit" disabled={pending} className="h-12 rounded-full bg-[#1f9d4a] text-sm font-semibold text-white">
        {pending ? "Sending..." : "Send message"}
      </button>
      {state.message ? <p className="text-sm text-slate-600">{state.message}</p> : null}
    </form>
  );
}
