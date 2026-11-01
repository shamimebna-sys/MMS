import type { Metadata } from "next";
import { ContactForm } from "@/components/site/contact-form";

export const metadata: Metadata = { title: "Contact Us · EUJOBBD" };

export default function ContactPage() {
  return (
    <article className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">Write to us</p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">Contact us</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">Send a message and we will reply from the Nicosia office.</p>
        <dl className="mt-8 space-y-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Address</dt>
            <dd className="mt-1">22 Akropoleos Street, 1D Strovolos, Nicosia, Cyprus</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Email</dt>
            <dd className="mt-1">info@eujobbd.com</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-slate-400">Phone</dt>
            <dd className="mt-1">+357 96666764</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-[2rem] bg-white p-6 shadow-sm md:p-8">
        <ContactForm />
      </div>
    </article>
  );
}
