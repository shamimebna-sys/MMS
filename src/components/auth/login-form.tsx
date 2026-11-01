"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { loginAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter the password."),
});

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, submit, pending] = useActionState(loginAction, {});
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Card */}
      <div className="w-full max-w-[22rem]">
        {/* Brand mark */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-sidebar shadow-[var(--shadow-lg)]">
            <span className="text-[15px] font-bold tracking-tight text-amber-100">EA</span>
          </div>
          <h1 className="text-[1.5rem] font-semibold tracking-tight text-foreground">Sign in</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            E &amp; A Air International &middot; Manpower
          </p>
        </div>

        {/* Form */}
        <div className="surface p-6">
          <form
            method="post"
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => {
              const data = new FormData();
              data.set("email", values.email);
              data.set("password", values.password);
              if (next.startsWith("/") && !next.startsWith("//")) data.set("next", next);
              startTransition(() => {
                submit(data);
              });
            })}
          >
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-foreground">Email</span>
              <input
                className="control"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-[12px] text-red-600">{form.formState.errors.email.message}</p>
              ) : null}
            </label>

            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-foreground">Password</span>
              <input
                className="control"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-[12px] text-red-600">{form.formState.errors.password.message}</p>
              ) : null}
            </label>

            {state.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                {state.error}
              </div>
            ) : null}

            <Button type="submit" disabled={pending} className="mt-1 w-full">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-4 border-t border-border pt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-[12.5px] font-medium text-accent hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted">
          Login to EUJOBBD with your registered account.
        </p>
      </div>
    </div>
  );
}
