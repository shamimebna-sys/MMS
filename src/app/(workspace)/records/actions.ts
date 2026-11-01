"use server";

import { redirect } from "next/navigation";
import { candidateSchema } from "@/features/candidates/schema";
import { partySchema } from "@/features/parties/schema";
import { paymentSchema } from "@/features/payments/schema";
import { prisma } from "@/lib/db";
import { requestIp, requireUser } from "@/server/current-user";
import { createCandidateRecord, createPartyRecord, createPaymentRecord, softDeleteRecord, updateCandidateRecord } from "@/server/mutations";
import { getResource } from "@/server/resources";
import { deleteBreadRecord } from "@/server/bread-form";
import { writeAudit } from "@/server/audit";
import { hasFullAccess } from "@/lib/auth/permissions";

export type ActionState = { error?: string };

function values(formData: FormData): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") output[key] = value;
  }
  return output;
}

export async function createCandidateAction(_state: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = candidateSchema.safeParse(values(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  let id = 0;
  try {
    id = await createCandidateRecord(user, parsed.data, await requestIp());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the candidate." };
  }
  redirect(`/records/candidates/${id}`);
}

export async function updateCandidateAction(_state: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const parsed = candidateSchema.pick({ name: true, mobile: true, status: true, position: true }).safeParse(values(formData));
  if (!Number.isInteger(id) || !parsed.success) return { error: "Check the form." };
  try {
    await updateCandidateRecord(user, id, parsed.data, await requestIp());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the candidate." };
  }
  redirect(`/records/candidates/${id}`);
}

export async function createPaymentAction(_state: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(values(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  let id = 0;
  try {
    id = await createPaymentRecord(user, parsed.data, await requestIp());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the payment." };
  }
  redirect(`/records/payments/${id}`);
}

export async function createPartyAction(_state: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const slug = String(formData.get("resource") ?? "");
  const resource = getResource(slug);
  if (!resource) return { error: "Unknown module." };
  const parsed = partySchema.safeParse(values(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  let id = 0;
  try {
    id = await createPartyRecord(user, resource, parsed.data, await requestIp());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the record." };
  }
  redirect(`/records/${resource.slug}/${id}`);
}

export async function archiveRecordAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = String(formData.get("resource") ?? "");
  const id = Number(formData.get("id"));
  const resource = getResource(slug);
  if (!resource || !Number.isInteger(id)) return;
  await softDeleteRecord(user, resource, id, await requestIp());
  redirect(`/records/${slug}`);
}

export async function deleteBreadFormAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const back = await deleteBreadRecord(user, slug, id, await requestIp());
  redirect(`/records/${back}`);
}

export async function queueExportAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!hasFullAccess(user)) return;
  const slug = String(formData.get("resource") ?? "candidates");
  await prisma.job.create({
    data: {
      type: "export_excel",
      payload: { resource: slug, userId: user.id },
    },
  });
  await writeAudit({ userId: user.id, action: "queue_export", entityType: "jobs", metadata: { resource: slug }, ip: await requestIp() });
  redirect("/records/jobs");
}
