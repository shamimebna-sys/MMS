import { Button } from "@/components/ui/button";
import { canWriteHistoricalAssignment, writablePartyCategory } from "@/lib/historical-party-assignment-write";
import type { HistoricalAssignmentRow } from "@/lib/historical-party-assignment";
import { getCurrentUser } from "@/server/current-user";
import { createAssignmentAction, replaceAssignmentAction } from "@/app/(workspace)/historical-assignments/actions";

const NOTICES: Record<string, string> = {
  forbidden: "You cannot change historical assignments.",
  invalid_category: "Only an Agent, Sub-Agent, Agencier, or Companier assignment can be created or reassigned here.",
  invalid_candidate: "That candidate record was not found.",
  invalid_party: "That party record was not found.",
  invalid_name: "The party name is blank, so the assignment was not saved.",
  invalid_reason: "A closure reason is required.",
  not_found: "That assignment was not found.",
  conflict: "The active assignment changed. Refresh and try again.",
};

export async function AssignmentCreatePanel({ notice }: { notice?: string }) {
  const user = await getCurrentUser();
  if (!canWriteHistoricalAssignment(user)) return null;
  return (
    <section className="listing mb-4">
      <div className="listing-header">
        <div className="min-w-0">
          <h2 className="listing-title">Create assignment</h2>
          <p className="listing-desc">
            Agent, Sub-Agent, Agencier, and Companier. The original name is copied from that party record. Agent and Sub-Agent copy each present and permanent address part separately. Agencier and Companier copy the address column.
          </p>
        </div>
      </div>
      <Notice code={notice} />
      <form action={createAssignmentAction} className="grid grid-cols-1 gap-4 px-1 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm text-[var(--listing-heading)]">
          <span className="mb-1 block text-xs font-medium text-[var(--listing-muted)]">Candidate id</span>
          <input name="candidateId" inputMode="numeric" required className="control" />
        </label>
        <label className="block text-sm text-[var(--listing-heading)]">
          <span className="mb-1 block text-xs font-medium text-[var(--listing-muted)]">Category</span>
          <select name="partyCategory" required defaultValue="agencier" className="control">
            <option value="agent">agent</option>
            <option value="sub_agent">sub_agent</option>
            <option value="agencier">agencier</option>
            <option value="companier">companier</option>
          </select>
        </label>
        <label className="block text-sm text-[var(--listing-heading)]">
          <span className="mb-1 block text-xs font-medium text-[var(--listing-muted)]">Party id</span>
          <input name="partyId" inputMode="numeric" required className="control" />
        </label>
        <div className="flex items-end">
          <Button type="submit">Create assignment</Button>
        </div>
      </form>
    </section>
  );
}

export async function AssignmentReplacePanel({
  row,
  notice,
}: {
  row: HistoricalAssignmentRow;
  notice?: string;
}) {
  const user = await getCurrentUser();
  if (!canWriteHistoricalAssignment(user)) return null;
  if (row.status !== "ACTIVE") return null;
  if (!writablePartyCategory(row.partyCategory)) return null;
  return (
    <section className="listing mt-4">
      <div className="listing-header">
        <div className="min-w-0">
          <h2 className="listing-title">Reassign assignment</h2>
          <p className="listing-desc">
            Closes this active {row.partyCategory} assignment and opens a new one for the same candidate. The previous name and address snapshot stays closed.
          </p>
        </div>
      </div>
      <Notice code={notice} />
      <form action={replaceAssignmentAction} className="grid grid-cols-1 gap-4 px-1 pb-5 sm:grid-cols-2">
        <input type="hidden" name="assignmentId" value={String(row.id)} />
        <input type="hidden" name="partyCategory" value={row.partyCategory} />
        <label className="block text-sm text-[var(--listing-heading)]">
          <span className="mb-1 block text-xs font-medium text-[var(--listing-muted)]">New party id</span>
          <input name="partyId" inputMode="numeric" required className="control" />
        </label>
        <label className="block text-sm text-[var(--listing-heading)]">
          <span className="mb-1 block text-xs font-medium text-[var(--listing-muted)]">Closure reason</span>
          <input name="reason" required className="control" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit">Reassign</Button>
        </div>
      </form>
    </section>
  );
}

function Notice({ code }: { code?: string }) {
  if (!code) return null;
  const text = NOTICES[code];
  if (!text) return null;
  return <p className="px-1 pb-3 text-sm text-red-700">{text}</p>;
}
