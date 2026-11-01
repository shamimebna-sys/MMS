import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Portrait } from "@/components/media/portrait";
import { readPublicPost } from "@/server/public-site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await readPublicPost((await params).slug);
  return { title: post ? `${post.title} · EUJOBBD` : "News · EUJOBBD" };
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await readPublicPost((await params).slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/news" className="text-sm font-semibold text-[#1f9d4a]">All posts</Link>
      <p className="mt-6 text-xs text-slate-500">{post.date}</p>
      <h1 className="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight">{post.title}</h1>
      {post.image ? <Portrait path={post.image} name={post.title} className="mt-8 aspect-[16/9] w-full rounded-3xl" /> : null}
      <p className="mt-8 whitespace-pre-wrap text-lg leading-8 text-slate-700">{post.body || post.excerpt}</p>
    </article>
  );
}
