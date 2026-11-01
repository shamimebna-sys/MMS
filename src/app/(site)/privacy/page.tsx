import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · EUJOBBD" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">Privacy</h1>
      <div className="mt-8 space-y-4 text-sm leading-7 text-slate-600">
        <p>E & A AIR INTERNATIONAL keeps candidate files so agents and employers can complete a Cyprus placement. The public site shows a name, a role, and experience marks. Passport numbers, phone numbers, and email addresses stay inside the office panel.</p>
        <p>Messages sent from the contact form and newsletter box go to info@eujobbd.com. We use them to reply or to send job notices you asked for.</p>
        <p>Questions about a file: info@eujobbd.com or 22 Akropoleos Street, 1D Strovolos, Nicosia, Cyprus.</p>
      </div>
    </article>
  );
}
