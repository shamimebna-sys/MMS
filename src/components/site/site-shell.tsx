"use client";

import Link from "next/link";
import { useState } from "react";
import { NewsletterForm } from "@/components/site/newsletter-form";

const NAV = [
  ["/", "Home"],
  ["/about", "About Us"],
  ["/jobs", "Jobs"],
  ["/candidates", "Candidates"],
  ["/news", "News"],
  ["/faq", "FAQS"],
  ["/contact", "Contact Us"],
] as const;

const HOT = [
  ["Waiter", "waiter"],
  ["Cook", "cook"],
  ["Housekeeping", "house"],
  ["Electrician", "electric"],
] as const;

export function SiteShell({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f4faf6] text-slate-900">
      <header className="sticky top-0 z-30 bg-[#1f9d4a] text-white shadow-lg shadow-emerald-900/10">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-white/80 text-xs font-bold tracking-wide">EA</span>
            <span className="leading-tight">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">E & A Air</span>
              <span className="block text-sm font-semibold">EUJOBBD</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-white/90 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link href="/dashboard" className="hidden rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#146c32] sm:inline-flex">
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="hidden rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#146c32] sm:inline-flex">
                Login
              </Link>
            )}
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 md:hidden" aria-label="Open menu" onClick={() => setOpen((value) => !value)}>
              <span className="block h-0.5 w-4 bg-white shadow-[0_6px_0_white,0_-6px_0_white]" />
            </button>
          </div>
        </div>
        {open ? (
          <nav className="border-t border-white/15 px-4 py-3 md:hidden">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="block py-3 text-sm" onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
            <Link href={signedIn ? "/dashboard" : "/login"} className="mt-2 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#146c32]" onClick={() => setOpen(false)}>
              {signedIn ? "Dashboard" : "Login"}
            </Link>
          </nav>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="mt-20 bg-[#0d2416] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-200">Contact info</h2>
            <p className="mt-4 text-sm leading-6 text-white/75">22 Akropoleos Street, 1D Strovolos, Nicosia, Cyprus</p>
            <p className="mt-2 text-sm text-white/75">info@eujobbd.com</p>
            <p className="mt-1 text-sm text-white/75">+357 96666764</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-200">Useful links</h2>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              <li><Link href="/privacy" className="hover:text-white">Policy Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms And Conditions</Link></li>
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact Us</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-200">Hot jobs</h2>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              {HOT.map(([label, q]) => (
                <li key={q}>
                  <Link href={`/jobs?q=${q}`} className="hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-200">Newsletter</h2>
            <p className="mt-4 text-sm leading-6 text-white/75">Join our email subscription now to get updates on new jobs and notifications.</p>
            <NewsletterForm />
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} EUJOBBD. All rights reserved.</div>
      </footer>
    </div>
  );
}
