import { redirect } from "next/navigation";
import { AssignmentReplacePanel } from "@/components/historical-assignments/write";
import { AssignmentDenied, AssignmentDetail, AssignmentMissing } from "@/components/historical-assignments/view";
import { getHistoricalPartyAssignment } from "@/server/historical-party-assignment-view";

export const dynamic = "force-dynamic";

export default async function HistoricalAssignmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string; actorId?: string; permission?: string; notice?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const result = await getHistoricalPartyAssignment({
    assignmentId: id,
    role: query.role,
    actorId: query.actorId,
    permission: query.permission,
  });
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login");
    return <AssignmentDenied />;
  }
  if (!result.data) return <AssignmentMissing />;
  return (
    <>
      <AssignmentDetail row={result.data} />
      <AssignmentReplacePanel row={result.data} notice={query.notice} />
    </>
  );
}
