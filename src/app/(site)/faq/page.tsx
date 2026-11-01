import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "FAQ · EUJOBBD" };

const ITEMS = [
  ["How do I find and apply for a job?", "Sign in, or ask your agent to open your file. A complete profile — skills, experience, and documents — is what employers see first."],
  ["I already have an account. Can I apply again?", "Yes. Log in and your existing file is used for the next vacancy. You do not start from zero."],
  ["Who can apply?", "If a Cyprus opening matches your trade, apply. Hospitality, construction, caregiving, and skilled trades are all on the board."],
  ["Where are the open positions?", "Every active group is on the jobs page."],
  ["How is my application handled?", "Apply through your agent or the office. We confirm the file and move it through selection, medical, visa, and flight."],
  ["When will I hear back?", "A full placement often takes 6 to 8 weeks. You should hear within 6 weeks of a complete file."],
];

export default function FaqPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f9d4a]">Help</p>
      <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight">FAQS</h1>
      <div className="mt-10 space-y-4">
        {ITEMS.map(([question, answer]) => (
          <section key={question} className="rounded-3xl bg-white p-6">
            <h2 className="text-lg font-semibold">{question}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-slate-600">
        Further questions: <a className="font-semibold text-[#1f9d4a]" href="mailto:info@eujobbd.com">info@eujobbd.com</a>. Open roles are on the <Link href="/jobs" className="font-semibold text-[#1f9d4a]">jobs page</Link>.
      </p>
    </article>
  );
}
