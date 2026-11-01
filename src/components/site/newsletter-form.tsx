"use client";

import { useActionState } from "react";
import { subscribeAction } from "@/app/(site)/actions";

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeAction, { message: "" });
  return (
    <form action={action} className="mt-4 flex gap-2">
      <input name="email" type="email" required placeholder="Enter your email..." className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white placeholder:text-white/50" />
      <button type="submit" disabled={pending} className="h-11 rounded-full bg-white px-4 text-sm font-semibold text-[#146c32]">
        {pending ? "..." : "Subscribe"}
      </button>
      {state.message ? <p className="sr-only">{state.message}</p> : null}
      {state.message ? <p className="basis-full text-xs text-emerald-100">{state.message}</p> : null}
    </form>
  );
}
