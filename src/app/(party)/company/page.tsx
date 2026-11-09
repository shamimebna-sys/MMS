import { redirect } from "next/navigation";
import DashboardPage from "@/app/(workspace)/dashboard/page";
import { AccessRestricted } from "@/components/auth/access-restricted";
import { COMPANY_LANDING, workspaceGate } from "@/lib/role-landing";
import { requireUser } from "@/server/current-user";

export const dynamic = "force-dynamic";

export default async function CompanyLandingPage() {
  const user = await requireUser();
  const gate = workspaceGate({ roleName: user.roleName, candidateId: user.candidateId, pathname: COMPANY_LANDING });
  if (gate.action === "redirect") redirect(gate.href);
  if (gate.action === "restricted") return <AccessRestricted />;
  return <DashboardPage />;
}
