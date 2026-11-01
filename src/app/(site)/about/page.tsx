import type { Metadata } from "next";
import { loadPublicHome } from "@/server/public-site";

export const metadata: Metadata = { title: "About Us · EUJOBBD" };
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const data = await loadPublicHome();
  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">E & A AIR INTERNATIONAL</p>
      <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">About us</h1>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600">
        We place professionals with Cyprus companies. The work started by listening to agents and candidates, then grew into one file for selection, medical, visa, manpower, and flight. The office is in Strovolos, Nicosia.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          [data.candidates.toLocaleString(), "Registered candidates"],
          [data.jobs.toLocaleString(), "Open job groups"],
          [data.employers.toLocaleString(), "Employers"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-3xl bg-white p-6">
            <p className="text-3xl font-semibold text-[#146c32]">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {[
          ["2009", "The recruitment desk was established and began placing hospitality and construction workers."],
          ["Cyprus", "Licences, companies, and agencies are tracked from Nicosia so every candidate has one employer path."],
          ["Today", "Agents, sub agents, and the office share the same candidate file, from interview to departure."],
        ].map(([year, copy]) => (
          <section key={year} className="rounded-3xl border border-emerald-100 bg-white p-6">
            <p className="text-sm font-semibold text-[#1f9d4a]">{year}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
