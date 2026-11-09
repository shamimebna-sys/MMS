import { redirect } from "next/navigation";
import { AccessRestricted } from "@/components/auth/access-restricted";
import { AppShell } from "@/components/shell/app-shell";
import { partyLanding, workspaceGate } from "@/lib/role-landing";
import { requireUser, sessionAvatar, sessionEmail } from "@/server/current-user";
import { loadShellHeader } from "@/server/dashboard";

export const dynamic = "force-dynamic";

export default async function PartyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const landing = partyLanding(user.roleName);
  const gate = workspaceGate({
    roleName: user.roleName,
    candidateId: user.candidateId,
    pathname: landing ?? "/company",
  });
  if (gate.action === "redirect") redirect(gate.href);
  if (gate.action === "restricted") return <AccessRestricted />;
  if (!landing) redirect("/dashboard");
  const header = await loadShellHeader(user.id);
  return (
    <AppShell
      groups={[]}
      userName={user.name || "User"}
      userEmail={sessionEmail(user)}
      userAvatar={sessionAvatar(user)}
      unread={header.unread}
      homeHref={landing}
      profileHref={landing}
      notificationsHref={landing}
    >
      {children}
    </AppShell>
  );
}
