import type { Metadata } from "next";
import Link from "next/link";
import { Portrait } from "@/components/media/portrait";
import { listPublicCandidates } from "@/server/public-site";

export const metadata: Metadata = { title: "Candidates · EUJOBBD" };
export const dynamic = "force-dynamic";

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const data = await listPublicCandidates(q, page);
  const pages = Math.max(1, Math.ceil(data.total / 12));
  const next = q ? `&q=${encodeURIComponent(q)}` : "";
  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">Profiles</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">Candidates</h1>
          <p className="mt-3 text-sm text-slate-500">{data.total.toLocaleString()} public profiles. Contact details stay with the office.</p>
        </div>
        <form action="/candidates" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search by name" className="h-12 w-56 rounded-full border border-slate-200 bg-white px-4" />
          <button type="submit" className="h-12 rounded-full bg-[#1f9d4a] px-5 text-sm font-semibold text-white">Search</button>
        </form>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.rows.map((person) => (
          <article key={person.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <Portrait path={person.photo} name={person.name} className="aspect-[4/3] w-full" />
            <div className="p-6">
            <h2 className="text-lg font-semibold">{person.name}</h2>
            <p className="mt-1 text-sm text-[#1f9d4a]">{person.role}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.08em] text-slate-500">
              Abroad: {person.abroad} years · Local: {person.local} years · English: {person.english ?? 0} marks
            </p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-8 flex gap-3 text-sm font-semibold">
        {page > 1 ? <Link href={`/candidates?page=${page - 1}${next}`}>Previous</Link> : null}
        <span className="text-slate-400">{page} / {pages}</span>
        {page < pages ? <Link href={`/candidates?page=${page + 1}${next}`}>Next</Link> : null}
      </div>
    </article>
  );
}
