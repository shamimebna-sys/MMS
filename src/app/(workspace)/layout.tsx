import Link from "next/link";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { AppShell, type NavGroup } from "@/components/shell/app-shell";
import { requireUser } from "@/server/current-user";
import { loadShellHeader } from "@/server/dashboard";
import { loadMenu } from "@/server/menu";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.roleName === "Company" || user.roleName === "Employer") redirect("/");
  if (user.roleName === "Candidate") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl font-semibold">Access Restricted</h1>
          <p className="mt-3 text-sm leading-6 text-muted">You are not authorized to access this page right now. Please contact the administrator for more information.</p>
          <Link href="/" className="btn-primary mt-6 inline-flex">Go Back Home</Link>
        </div>
      </main>
    );
  }
  const header = await loadShellHeader(user.id);
  const groups: NavGroup[] = await loadMenu(user);
  const identity = await pool.query(`SELECT email, avatar FROM users WHERE id = $1`, [user.id]);
  const account = identity.rows[0] as { email: string | null; avatar: string | null } | undefined;
  return (
    <AppShell
      groups={groups}
      userName={user.name || "User"}
      userEmail={account?.email?.trim() || ""}
      userAvatar={account?.avatar?.trim() || ""}
      unread={header.unread}
    >
      {children}
    </AppShell>
  );
}
