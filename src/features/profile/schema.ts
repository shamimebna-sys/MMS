import { z } from "zod";

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Client-side check before the existing profile photo upload. The server still validates the bytes. */
export function profilePhotoSelectionError(file: { size: number; type: string; name: string }): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > PROFILE_IMAGE_MAX_BYTES) {
    return "Image must be between 1 byte and 5 MB.";
  }
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (PROFILE_PHOTO_TYPES.has(type)) return null;
  if (!type && /\.(jpe?g|png|webp)$/i.test(file.name)) return null;
  return "Upload a JPEG, PNG, or WebP image.";
}

export type ProfileActionResult = { ok: true; message: string } | { ok: false; error: string };

export type ProfileViewModel = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  avatar: string;
  emailVerified: boolean;
  phone: string;
  designation: string;
  agent: string;
  agentMobile: string;
  agentBalance: string;
  subAgent: string;
  subAgentBalance: string;
};

/** Account columns a signed-in user must not be able to write from My Profile. */
export const PROTECTED_PROFILE_KEYS = [
  "id",
  "role",
  "roleId",
  "role_id",
  "status",
  "password",
  "permissions",
  "avatar",
  "agentId",
  "agent_id",
  "subAgentId",
  "sub_agent_id",
  "employeeId",
  "employee_id",
  "candidateId",
  "candidate_id",
  "userTypeId",
  "user_type_id",
  "emailVerifiedAt",
  "email_verified_at",
] as const;

export const profileUpdateSchema = z.strictObject({
  name: z.string().trim().min(1, "Enter your name.").max(255, "Name must be 255 characters or fewer."),
  email: z.string().trim().email("Enter a valid email.").max(255, "Email must be 255 characters or fewer."),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: z.string().min(12, "Use at least 12 characters.").max(200, "Password must be 200 characters or fewer."),
    confirmPassword: z.string().min(1, "Confirm the new password.").max(200),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "New password and confirmation do not match.",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export function protectedProfileField(payload: Record<string, unknown>): string | null {
  const hit = PROTECTED_PROFILE_KEYS.find((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (!hit) return null;
  return "Role, status, and account identifiers cannot be changed here.";
}

export function parseProfileUpdate(
  payload: Record<string, unknown>,
): { ok: true; data: ProfileUpdateInput } | { ok: false; error: string } {
  const blocked = protectedProfileField(payload);
  if (blocked) return { ok: false, error: blocked };
  const parsed = profileUpdateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the profile fields." };
  return { ok: true, data: parsed.data };
}

export function authorizeOwnAccount(
  sessionUserId: number | null,
  requestedUserId: unknown,
): { ok: true; userId: number } | { ok: false; error: string } {
  if (sessionUserId == null || !Number.isInteger(sessionUserId) || sessionUserId <= 0) {
    return { ok: false, error: "You need to sign in again." };
  }
  if (requestedUserId == null || requestedUserId === "") return { ok: true, userId: sessionUserId };
  const requested =
    typeof requestedUserId === "number"
      ? requestedUserId
      : typeof requestedUserId === "string" && /^\d+$/.test(requestedUserId)
        ? Number(requestedUserId)
        : Number.NaN;
  if (!Number.isInteger(requested) || requested !== sessionUserId) {
    return { ok: false, error: "You can only update your own account." };
  }
  return { ok: true, userId: sessionUserId };
}
