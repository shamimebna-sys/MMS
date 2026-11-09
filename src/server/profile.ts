import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  authorizeOwnAccount,
  parseProfileUpdate,
  passwordChangeSchema,
  protectedProfileField,
  type ProfileActionResult,
  type ProfileViewModel,
} from "@/features/profile/schema";
import { statusLabel } from "@/lib/utils";
import {
  avatarStoredFileId,
  prepareProfileImage,
  profileAvatarPath,
  type PreparedProfileImage,
} from "@/server/profile-image";

export type ProfileSource = {
  name: string | null;
  email: string | null;
  status: string | null;
  avatar: string | null;
  email_verified_at: Date | string | null;
  role_name: string | null;
  phone: string | null;
  designation: string | null;
  agent_code: string | null;
  agent_name: string | null;
  agent_mobile: string | null;
  agent_balance: string | null;
  sub_code: string | null;
  sub_name: string | null;
  sub_balance: string | null;
};

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

/** Public profile fields only. Password hashes and account identifiers other than the session id stay out. */
export function toPublicProfile(source: ProfileSource, id: number): ProfileViewModel {
  return {
    id,
    name: text(source.name),
    email: text(source.email),
    role: text(source.role_name),
    status: statusLabel(source.status),
    avatar: text(source.avatar),
    emailVerified: source.email_verified_at != null && text(source.email_verified_at) !== "",
    phone: text(source.phone),
    designation: text(source.designation),
    agent: [text(source.agent_code), text(source.agent_name)].filter(Boolean).join(" "),
    agentMobile: text(source.agent_mobile),
    agentBalance: text(source.agent_balance),
    subAgent: [text(source.sub_code), text(source.sub_name)].filter(Boolean).join(" "),
    subAgentBalance: text(source.sub_balance),
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export function profilePayloadFromForm(formData: FormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "userId" || typeof value !== "string") continue;
    payload[key] = value;
  }
  return payload;
}

type ProfileUpdateDeps = {
  findAccount: (userId: number) => Promise<{ email: string } | null>;
  emailTaken: (email: string, userId: number) => Promise<boolean>;
  save: (userId: number, data: { name: string; email: string; clearEmailVerified: boolean }) => Promise<void>;
};

export async function applyProfileUpdate(
  deps: ProfileUpdateDeps,
  userId: number,
  payload: Record<string, unknown>,
): Promise<ProfileActionResult> {
  const parsed = parseProfileUpdate(payload);
  if (!parsed.ok) return parsed;
  const account = await deps.findAccount(userId);
  if (!account) return { ok: false, error: "Account not found." };
  const emailChanged = account.email !== parsed.data.email;
  if (emailChanged && (await deps.emailTaken(parsed.data.email, userId))) {
    return { ok: false, error: "That email is already in use." };
  }
  try {
    await deps.save(userId, {
      name: parsed.data.name,
      email: parsed.data.email,
      clearEmailVerified: emailChanged,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "That email is already in use." };
    throw error;
  }
  return { ok: true, message: "Profile saved." };
}

export async function runProfileUpdate(
  sessionUserId: number | null,
  requestedUserId: unknown,
  payload: Record<string, unknown>,
  deps: ProfileUpdateDeps,
): Promise<ProfileActionResult> {
  const auth = authorizeOwnAccount(sessionUserId, requestedUserId);
  if (!auth.ok) return auth;
  return applyProfileUpdate(deps, auth.userId, payload);
}

type PasswordChangeDeps = {
  findPassword: (userId: number) => Promise<string | null>;
  commit: (userId: number, passwordHash: string) => Promise<void>;
};

export async function applyPasswordChange(
  deps: PasswordChangeDeps,
  userId: number,
  input: unknown,
): Promise<ProfileActionResult> {
  if (input && typeof input === "object") {
    const blocked = protectedProfileField(input as Record<string, unknown>);
    if (blocked) return { ok: false, error: blocked };
  }
  const currentPassword = input && typeof input === "object" ? (input as { currentPassword?: unknown }).currentPassword : undefined;
  const newPassword = input && typeof input === "object" ? (input as { newPassword?: unknown }).newPassword : undefined;
  const confirmPassword = input && typeof input === "object" ? (input as { confirmPassword?: unknown }).confirmPassword : undefined;
  const parsed = passwordChangeSchema.safeParse({ currentPassword, newPassword, confirmPassword });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password fields." };
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return { ok: false, error: "Choose a different password." };
  }
  const stored = await deps.findPassword(userId);
  if (!stored) return { ok: false, error: "Account not found." };
  const matches = await verifyPassword(parsed.data.currentPassword, stored);
  if (!matches) return { ok: false, error: "Current password is incorrect." };
  const hashed = await hashPassword(parsed.data.newPassword);
  await deps.commit(userId, hashed);
  return { ok: true, message: "Password updated. Other sessions were signed out." };
}

export async function runPasswordChange(
  sessionUserId: number | null,
  requestedUserId: unknown,
  input: unknown,
  deps: PasswordChangeDeps,
): Promise<ProfileActionResult> {
  const auth = authorizeOwnAccount(sessionUserId, requestedUserId);
  if (!auth.ok) return auth;
  return applyPasswordChange(deps, auth.userId, input);
}

export type ProfilePhotoDeps = {
  storeImage: (prepared: PreparedProfileImage) => Promise<{ id: string }>;
  readAvatar: () => Promise<string | null>;
  writeAvatar: (avatar: string | null) => Promise<void>;
  removeStoredFile: (id: string) => Promise<void>;
};

export async function saveProfilePhoto(deps: ProfilePhotoDeps, bytes: Buffer): Promise<ProfileActionResult & { avatar?: string }> {
  let prepared: PreparedProfileImage;
  try {
    prepared = await prepareProfileImage(bytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Upload a JPEG, PNG, or WebP image." };
  }
  let stored: { id: string };
  try {
    stored = await deps.storeImage(prepared);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /image|5 MB|upload path/i.test(message) ? message : "Upload failed.";
    return { ok: false, error: safe };
  }
  const nextAvatar = profileAvatarPath(stored.id);
  let previous: string | null;
  try {
    previous = await deps.readAvatar();
    await deps.writeAvatar(nextAvatar);
  } catch {
    await deps.removeStoredFile(stored.id);
    return { ok: false, error: "Could not save the profile photo." };
  }
  const previousId = avatarStoredFileId(previous);
  if (previousId && previousId !== stored.id) await deps.removeStoredFile(previousId);
  return { ok: true, message: "Profile photo updated.", avatar: nextAvatar };
}

export async function removeProfilePhoto(deps: Pick<ProfilePhotoDeps, "readAvatar" | "writeAvatar" | "removeStoredFile">): Promise<ProfileActionResult> {
  let previous: string | null;
  try {
    previous = await deps.readAvatar();
    await deps.writeAvatar(null);
  } catch {
    return { ok: false, error: "Could not remove the profile photo." };
  }
  const previousId = avatarStoredFileId(previous);
  if (previousId) await deps.removeStoredFile(previousId);
  return { ok: true, message: "Profile photo removed." };
}
