import { redirect } from "next/navigation";
import { AccessRestricted } from "@/components/auth/access-restricted";
import { AppShell } from "@/components/shell/app-shell";
import { candidateNavigation, isCandidateRole } from "@/lib/candidate-access";
import { getCurrentUser, sessionAvatar, sessionEmail } from "@/server/current-user";
import { loadCandidatePortal } from "@/server/candidate-portal";
import { loadShellHeader } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function CandidateHomeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCandidateRole(user.roleName)) redirect("/dashboard");
  if (user.candidateId == null) return <AccessRestricted />;
  const file = await loadCandidatePortal(user.candidateId);
  if (!file) return <AccessRestricted />;
  const header = await loadShellHeader(user.id);
  return (
    <AppShell
      groups={candidateNavigation()}
      userName={user.name || "Candidate"}
      userEmail={sessionEmail(user)}
      userAvatar={sessionAvatar(user)}
      unread={header.unread}
      homeHref="/candidate"
      profileHref="/candidate/profile"
      notificationsHref="/candidate/notices"
    >
      {children}
    </AppShell>
  );
}
