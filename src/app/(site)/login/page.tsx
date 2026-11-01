import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-6 py-16 text-center">Loading sign in…</div>}>
      <LoginForm />
    </Suspense>
  );
}
