"use server";

import { redirect } from "next/navigation";
import { createHistoricalPartyAssignment, reassignHistoricalPartyAssignment } from "@/server/historical-party-assignment-write";

export async function createAssignmentAction(formData: FormData) {
  const result = await createHistoricalPartyAssignment({
    candidateId: field(formData.get("candidateId")),
    partyCategory: field(formData.get("partyCategory")),
    partyId: field(formData.get("partyId")),
    actorId: field(formData.get("actorId")),
    role: field(formData.get("role")),
    status: field(formData.get("status")),
    originalName: field(formData.get("originalName")),
    originalAddress: field(formData.get("originalAddress")),
    presentAddress: field(formData.get("presentAddress")),
    permanentAddress: field(formData.get("permanentAddress")),
    becameActiveAt: field(formData.get("becameActiveAt")),
    assignmentStatus: field(formData.get("assignmentStatus")),
  });
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login");
    redirect(`/historical-assignments?notice=${result.code}`);
  }
  redirect(`/historical-assignments/${result.assignment.id}`);
}

export async function replaceAssignmentAction(formData: FormData) {
  const assignmentId = field(formData.get("assignmentId"));
  const result = await reassignHistoricalPartyAssignment({
    assignmentId,
    partyId: field(formData.get("partyId")),
    partyCategory: field(formData.get("partyCategory")),
    reason: field(formData.get("reason")),
    actorId: field(formData.get("actorId")),
    role: field(formData.get("role")),
    status: field(formData.get("status")),
    originalName: field(formData.get("originalName")),
    originalAddress: field(formData.get("originalAddress")),
    presentAddress: field(formData.get("presentAddress")),
    permanentAddress: field(formData.get("permanentAddress")),
    becameActiveAt: field(formData.get("becameActiveAt")),
    assignmentStatus: field(formData.get("assignmentStatus")),
  });
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login");
    const id = typeof assignmentId === "string" ? assignmentId : "";
    redirect(`/historical-assignments/${encodeURIComponent(id)}?notice=${result.code}`);
  }
  redirect(`/historical-assignments/${result.assignment.id}`);
}

function field(value: FormDataEntryValue | null): unknown {
  return typeof value === "string" ? value : null;
}
