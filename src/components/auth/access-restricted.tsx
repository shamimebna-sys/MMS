import Link from "next/link";
import { Lock } from "lucide-react";

/** The workspace screen shown when a signed-in account may not open that area. */
export function AccessRestricted() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#F3F5F8] px-4">
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="w-full max-w-[560px] rounded-2xl bg-white px-8 py-12 text-center shadow-[0_10px_40px_-12px_rgb(15_23_42/0.12)] sm:px-14 sm:py-16">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#F3F5F8]">
            <Lock className="h-7 w-7 text-[#94A3B8]" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-[1.75rem] font-bold tracking-tight text-[#DC2626] sm:text-[2rem]">Access Restricted</h1>
          <p className="mt-4 text-[15px] leading-6 text-[#334155]">You are not authorized to access this page right now.</p>
          <p className="mt-2 text-sm leading-6 text-[#64748B]">Please contact the administrator for more information.</p>
          <Link
            href="/"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-[#2563EB] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            Go Back Home
          </Link>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-[#94A3B8]">© {new Date().getFullYear()} EUJOBBD. All rights reserved.</p>
    </main>
  );
}
