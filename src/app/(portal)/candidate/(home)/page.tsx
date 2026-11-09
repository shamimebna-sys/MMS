import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalView } from "@/components/candidate/portal-view";
import { isCandidateRole } from "@/lib/candidate-access";
import { getCurrentUser } from "@/server/current-user";
import { loadCandidateNotices, loadCandidatePortal } from "@/server/candidate-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function CandidateHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCandidateRole(user.roleName)) redirect("/dashboard");
  if (user.candidateId == null) redirect("/dashboard");
  const [portal, notices] = await Promise.all([loadCandidatePortal(user.candidateId), loadCandidateNotices(user.id)]);
  if (!portal) return null;
  return <PortalView portal={portal} notices={notices} />;
}
