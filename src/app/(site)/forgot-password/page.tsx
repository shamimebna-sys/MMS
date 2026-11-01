"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, { message: "" });
  return (
    <section className="mx-auto flex max-w-md flex-col px-4 py-16">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#1f9d4a]">Account</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Reset password</h1>
      <p className="mt-2 text-sm text-slate-500">We will send a reset link if the account is active. The page does not reveal whether the email exists.</p>
      <form action={action} className="mt-6 grid gap-4 rounded-[2rem] bg-white p-6 shadow-sm">
        <label className="grid gap-1 text-sm">
          Email
          <input name="email" type="email" required className="control" />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
        {state.message ? <p className="text-sm">{state.message}</p> : null}
      </form>
      <Link href="/login" className="mt-4 text-sm font-medium text-[#1f9d4a]">
        Back to sign in
      </Link>
    </section>
  );
}
