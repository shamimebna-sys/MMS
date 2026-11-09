import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCandidateRole } from "@/lib/candidate-access";
import { getCurrentUser } from "@/server/current-user";
import { loadCandidateNotices } from "@/server/candidate-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notices",
};

export default async function CandidateNoticesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCandidateRole(user.roleName) || user.candidateId == null) redirect("/dashboard");
  const notices = await loadCandidateNotices(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Candidate</p>
        <h1 className="page-title mt-1">Notices</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Notifications stored for your account, and announcements published in the workspace.</p>
      </div>
      <section className="surface px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold">Notifications</h2>
        {notices.notifications.length ? (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {notices.notifications.map((item, index) => (
              <li key={`${item.title}-${item.when}-${index}`} className="py-3">
                <p className="text-sm font-medium">{item.title}</p>
                {item.detail ? <p className="mt-1 text-sm leading-5 text-muted">{item.detail}</p> : null}
                {item.when ? <p className="mt-1 text-[12px] text-muted">{item.when}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No notifications are stored for your account.</p>
        )}
      </section>
      <section className="surface px-5 py-5 sm:px-6">
        <h2 className="text-base font-semibold">Announcements</h2>
        {notices.announcements.length ? (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {notices.announcements.map((item, index) => (
              <li key={`${item.title}-${item.when}-${index}`} className="py-3">
                <p className="text-sm font-medium">{item.title}</p>
                {item.detail ? <p className="mt-1 text-sm leading-5 text-muted">{item.detail}</p> : null}
                {item.when ? <p className="mt-1 text-[12px] text-muted">{item.when}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">No announcements are published.</p>
        )}
      </section>
    </div>
  );
}
