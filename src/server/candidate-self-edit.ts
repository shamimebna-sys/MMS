import type { ProfileActionResult } from "@/features/profile/schema";
import type { AccessUser } from "@/lib/auth/permissions";
import { CANDIDATE_SELF_EDIT_FIELDS, parseCandidateSelfEdit, type CandidateSelfEditInput } from "@/lib/candidate-self-edit";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/profile";

function blank(value: string): string | null {
  return value ? value : null;
}

export async function saveCandidateSelfProfile(
  user: AccessUser | null,
  payload: Record<string, unknown>,
  ip: string | null,
): Promise<ProfileActionResult> {
  if (!user || user.roleName !== "Candidate" || user.candidateId == null) {
    return { ok: false, error: "You cannot edit this profile." };
  }
  const parsed = parseCandidateSelfEdit(payload);
  if (!parsed.ok) return parsed;

  const candidateId = user.candidateId;
  try {
    await prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({
        where: { id: user.id },
        select: { email: true, candidateId: true },
      });
      if (!account || account.candidateId !== candidateId) {
        throw new Error("You cannot edit this profile.");
      }
      if (account.email !== parsed.data.email) {
        const taken = await tx.user.findFirst({
          where: { id: { not: user.id }, email: { equals: parsed.data.email, mode: "insensitive" } },
          select: { id: true },
        });
        if (taken) throw new Error("That email is already in use.");
      }
      const candidate = await tx.candidate.updateMany({
        where: { id: candidateId, deletedAt: null },
        data: candidateWrite(parsed.data),
      });
      if (candidate.count !== 1) throw new Error("You cannot edit this profile.");
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          ...(account.email !== parsed.data.email ? { emailVerifiedAt: null } : {}),
          updatedAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That email is already in use." };
    const message = error instanceof Error ? error.message : "";
    if (message === "You cannot edit this profile." || message === "That email is already in use.") {
      return { ok: false, error: message };
    }
    throw error;
  }

  await writeAudit({
    userId: user.id,
    action: "candidate_profile_update",
    entityType: "candidates",
    entityId: String(candidateId),
    metadata: { fields: [...CANDIDATE_SELF_EDIT_FIELDS] },
    ip,
  });
  return { ok: true, message: "Profile saved." };
}

function candidateWrite(data: CandidateSelfEditInput) {
  return {
    name: data.name,
    email: data.email,
    secondaryEmail: blank(data.secondaryEmail),
    mobile: blank(data.mobile),
    secondaryMobile: blank(data.secondaryMobile),
    emergencyMobile: blank(data.emergencyMobile),
    nid: blank(data.nid),
    bid: blank(data.bid),
    dob: data.dob ? new Date(`${data.dob}T00:00:00.000Z`) : null,
    gender: blank(data.gender),
    bloodGroup: blank(data.bloodGroup),
    nationality: blank(data.nationality),
    fatherName: blank(data.fatherName),
    motherName: blank(data.motherName),
    maritalStatus: blank(data.maritalStatus),
    height: blank(data.height),
    weight: blank(data.weight),
    updatedAt: new Date(),
  };
}
