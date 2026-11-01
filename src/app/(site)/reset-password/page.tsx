import { Suspense } from "react";
import { ResetForm } from "@/components/auth/reset-form";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="px-6 py-16 text-center">Loading reset form…</div>}>
      <ResetForm />
    </Suspense>
  );
}
