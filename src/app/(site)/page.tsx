import Link from "next/link";
import { Portrait } from "@/components/media/portrait";
import { loadPublicHome } from "@/server/public-site";

export const dynamic = "force-dynamic";

const VALUES = [
  ["Knowledge", "We train people in-house and keep every file ready for the employer."],
  ["Integrity", "The same standard for candidates, agents, and the companies who hire them."],
  ["Adaptability", "Cyprus hiring moves quickly. We move with the licence, the visa, and the flight."],
  ["Excellence", "Medical, police, labour, and travel stay on one record so nothing is lost."],
];

export default async function HomePage() {
  const data = await loadPublicHome();
  return (
    <div>
      <section className="relative overflow-hidden bg-[#0e3d22] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(47,184,92,0.45),transparent_42%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.12),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">E & A AIR INTERNATIONAL</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
              Top recruiting website
              <span className="mt-2 block text-emerald-300">for professionals</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/75">Jobs and job search for Cyprus. Waiter, cook, housekeeping, construction, and skilled trades, handled from selection to flight.</p>
            <form action="/jobs" className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
              <input name="q" placeholder="Search a job, for example cook" className="h-14 flex-1 rounded-full border border-white/20 bg-white px-5 text-slate-900" />
              <button type="submit" className="h-14 rounded-full bg-[#1f9d4a] px-7 text-sm font-semibold text-white">Find jobs</button>
            </form>
          </div>
          <aside className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All jobs list</h2>
              <Link href="/jobs" className="text-sm text-emerald-200">See all</Link>
            </div>
            <ul className="mt-4 space-y-2">
              {data.hotJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`} className="block rounded-2xl bg-white/10 px-4 py-3 text-sm hover:bg-white/15">
                    {job.code ? `(${job.code}) ` : ""}{job.name}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [data.candidates.toLocaleString(), "Candidates"],
          [data.jobs.toLocaleString(), "Total jobs"],
          [data.employers.toLocaleString(), "Employers"],
          [data.selected.toLocaleString(), "Selected"],
        ].map(([value, label]) => (
          <article key={label} className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="text-3xl font-semibold tracking-tight text-[#146c32]">{value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">From our blog</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Latest post</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {data.posts.map((post) => (
            <article key={post.slug} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm">
              {post.image ? <Portrait path={post.image} name={post.title} className="aspect-[16/9] w-full" /> : null}
              <div className="flex flex-1 flex-col p-6">
              <p className="text-xs text-slate-500">{post.date}</p>
              <h3 className="mt-3 text-xl font-semibold">
                <Link href={`/news/${post.slug}`}>{post.title}</Link>
              </h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{post.excerpt || "Read the full note."}</p>
              <Link href={`/news/${post.slug}`} className="mt-5 text-sm font-semibold text-[#1f9d4a]">Read more</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:grid-cols-2 lg:grid-cols-4">
        {VALUES.map(([title, copy]) => (
          <article key={title} className="rounded-3xl bg-white p-6">
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="overflow-hidden rounded-[2rem] bg-[#146c32] px-8 py-12 text-white md:px-14">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">Don’t just find. Be found.</h2>
          <p className="mt-4 max-w-2xl text-white/80">Put your profile in front of Cyprus employers. Sign in so your agent can place you on a licence, a medical, and a flight.</p>
          <Link href="/login" className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-semibold text-[#146c32]">Login to apply</Link>
        </div>
      </section>
    </div>
  );
}
