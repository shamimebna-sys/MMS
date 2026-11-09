import { redirect } from "next/navigation";
import { AssignmentCreatePanel } from "@/components/historical-assignments/write";
import { AssignmentDenied, AssignmentList, type AssignmentListFilters } from "@/components/historical-assignments/view";
import { listHistoricalPartyAssignments } from "@/server/historical-party-assignment-view";

export const dynamic = "force-dynamic";

export default async function HistoricalAssignmentListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    candidateId?: string;
    partyId?: string;
    partyCategory?: string;
    status?: string;
    closedByUserId?: string;
    page?: string;
    notice?: string;
    role?: string;
    actorId?: string;
    permission?: string;
  }>;
}) {
  const query = await searchParams;
  const result = await listHistoricalPartyAssignments({
    q: query.q,
    candidateId: query.candidateId,
    partyId: query.partyId,
    partyCategory: query.partyCategory,
    status: query.status,
    closedByUserId: query.closedByUserId,
    page: query.page,
    role: query.role,
    actorId: query.actorId,
    permission: query.permission,
  });
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login");
    return <AssignmentDenied />;
  }
  const filters: AssignmentListFilters = {
    q: query.q,
    candidateId: query.candidateId,
    partyId: query.partyId,
    partyCategory: query.partyCategory,
    status: query.status,
    closedByUserId: query.closedByUserId,
  };
  return (
    <>
      <AssignmentCreatePanel notice={query.notice} />
      <AssignmentList page={result.data} filters={filters} />
    </>
  );
}
