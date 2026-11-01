import type { Metadata } from "next";
import Link from "next/link";
import { Portrait } from "@/components/media/portrait";
import { listPublicPosts } from "@/server/public-site";

export const metadata: Metadata = { title: "News · EUJOBBD" };
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const posts = await listPublicPosts();
  return (
    <article className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">From our blog</p>
      <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">Latest posts</h1>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {posts.map((post) => (
          <Link key={post.slug} href={`/news/${post.slug}`} className="overflow-hidden rounded-3xl bg-white shadow-sm">
            {post.image ? <Portrait path={post.image} name={post.title} className="aspect-[16/9] w-full" /> : null}
            <div className="p-6">
            <p className="text-xs text-slate-500">{post.date}</p>
            <h2 className="mt-2 text-2xl font-semibold">{post.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </article>
  );
}
