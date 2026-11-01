"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export function ResetForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(resetPasswordAction, { error: "", done: false });
  return (
    <section className="mx-auto flex max-w-md flex-col px-4 py-16">
      <h1 className="page-title">Choose a new password</h1>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={params.get("token") ?? ""} />
        <label className="grid gap-1 text-sm">
          New password
          <input name="password" type="password" minLength={12} required autoComplete="new-password" className="control" />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
      {state.error ? <p className="mt-4 text-sm text-red-600">{state.error}</p> : null}
      {state.done ? (
        <p className="mt-4 text-sm">
          Password updated. <Link href="/login" className="text-accent">Sign in</Link>
        </p>
      ) : null}
    </section>
  );
}
