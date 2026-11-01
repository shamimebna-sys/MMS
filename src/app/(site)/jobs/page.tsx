import type { Metadata } from "next";
import Link from "next/link";
import { listPublicJobs } from "@/server/public-site";

export const metadata: Metadata = { title: "Jobs · EUJOBBD" };
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const jobs = await listPublicJobs(q);
  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">Open groups</p>
          <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">Jobs</h1>
        </div>
        <form action="/jobs" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search jobs" className="h-12 w-56 rounded-full border border-slate-200 bg-white px-4" />
          <button type="submit" className="h-12 rounded-full bg-[#1f9d4a] px-5 text-sm font-semibold text-white">Search</button>
        </form>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {jobs.length === 0 ? <p className="text-sm text-slate-500">No jobs match that search.</p> : null}
        {jobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f9d4a]">{job.code || "Group"}</p>
            <h2 className="mt-2 text-xl font-semibold">{job.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-600">{job.description || "Cyprus placement. Ask the office or your agent to apply."}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
