import { SiteShell } from "@/components/site/site-shell";
import { getCurrentUser } from "@/server/current-user";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return <SiteShell signedIn={Boolean(user)}>{children}</SiteShell>;
}
