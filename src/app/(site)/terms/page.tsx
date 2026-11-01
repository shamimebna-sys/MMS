import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · EUJOBBD" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Terms and conditions</h1>
      <div className="mt-8 space-y-4 text-sm leading-7 text-slate-600">
        <p>Job groups on this site describe openings handled by E & A AIR INTERNATIONAL. A listing is not a promise of a visa, a licence, or a start date.</p>
        <p>Applications go through the office or an appointed agent. Documents you upload must be yours. The office can refuse a file that is incomplete or not genuine.</p>
        <p>The Nicosia office is the contact for any dispute about a placement: info@eujobbd.com.</p>
      </div>
    </article>
  );
}
