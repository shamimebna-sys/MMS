import { redirect } from "next/navigation";
import { AccessRestricted } from "@/components/auth/access-restricted";
import { staffDeskGate } from "@/lib/role-landing";
import { AppShell, type NavGroup } from "@/components/shell/app-shell";
import { requireUser, sessionAvatar, sessionEmail } from "@/server/current-user";
import { loadShellHeader } from "@/server/dashboard";
import { loadMenu } from "@/server/menu";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const gate = staffDeskGate(user.roleName, user.candidateId);
  if (gate.action === "redirect") redirect(gate.href);
  if (gate.action === "restricted") return <AccessRestricted />;
  const header = await loadShellHeader(user.id);
  const groups: NavGroup[] = await loadMenu(user);
  return (
    <AppShell
      groups={groups}
      userName={user.name || "User"}
      userEmail={sessionEmail(user)}
      userAvatar={sessionAvatar(user)}
      unread={header.unread}
    >
      {children}
    </AppShell>
  );
}
