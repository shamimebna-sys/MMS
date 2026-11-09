import type { AccessUser } from "@/lib/auth/permissions";
import { releaseStoredUploads, storeUpload } from "@/server/uploads";

/** Wallet payments are created for the signed-in agent or sub-agent, never for a submitted record id. */
export function canAddWalletPayment(user: AccessUser): boolean {
  if (user.status && user.status !== "A") return false;
  return user.agentId != null || user.subAgentId != null;
}

export function assertCanAddWalletPayment(user: AccessUser): void {
  if (!canAddWalletPayment(user)) throw new Error("You cannot add a wallet payment.");
}

export async function withWalletCheque<T>(
  user: AccessUser,
  file: File | null,
  save: (chequeFilePath: string | null) => Promise<T>,
): Promise<T> {
  assertCanAddWalletPayment(user);
  if (!(file instanceof File) || file.size <= 0) return save(null);
  const stored = await storeUpload({
    bytes: Buffer.from(await file.arrayBuffer()),
    originalName: file.name,
    declaredType: file.type,
    ownerTable: "payments",
    createdBy: user.id,
  });
  try {
    return await save(`/api/files/${stored.id}`);
  } catch (error) {
    await releaseStoredUploads([stored.id]);
    throw error;
  }
}
