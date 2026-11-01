import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readPublicJob } from "@/server/public-site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = await readPublicJob(Number((await params).id));
  return { title: job ? `${job.name} · EUJOBBD` : "Job · EUJOBBD" };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const job = await readPublicJob(id);
  if (!job) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/jobs" className="text-sm font-semibold text-[#1f9d4a]">All jobs</Link>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{job.code || "Group"}</p>
      <h1 className="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight">{job.name}</h1>
      <p className="mt-6 text-lg leading-8 text-slate-600">{job.description || "This group is open for Cyprus placement. Sign in so your agent can add you to the file."}</p>
      <Link href="/login" className="mt-8 inline-flex h-12 items-center rounded-full bg-[#1f9d4a] px-6 text-sm font-semibold text-white">Login to apply</Link>
    </article>
  );
}
