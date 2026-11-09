"use server";

import { revalidatePath } from "next/cache";
import type { ProfileActionResult } from "@/features/profile/schema";
import { getCurrentUser, requestIp } from "@/server/current-user";
import { saveCandidateSelfProfile } from "@/server/candidate-self-edit";

export async function updateCandidateProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      return { ok: false, error: "Documents cannot be changed from the candidate portal." };
    }
    payload[key] = value;
  }
  const user = await getCurrentUser();
  const result = await saveCandidateSelfProfile(user, payload, await requestIp());
  if (result.ok) {
    revalidatePath("/candidate", "layout");
    revalidatePath("/candidate/profile");
  }
  return result;
}
