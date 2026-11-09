import { hasFullAccess, type AccessUser } from "@/lib/auth/permissions";

const ALIAS = /^[a-z_][a-z0-9_]*$/;

/**
 * A candidate profile is public only after the office places that candidate on the banner list.
 * Named, active, or pipeline rows are not public by themselves.
 */
export function publicCandidateFilter(alias = "c"): string {
  if (!ALIAS.test(alias)) throw new Error("Unsafe identifier.");
  return `${alias}.deleted_at IS NULL AND btrim(coalesce(${alias}.name, '')) <> '' AND EXISTS (SELECT 1 FROM selected_candidates s WHERE s.candidate_id = ${alias}.id)`;
}

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,240}$/;

/** Placeholder portrait used when an account has no photo. It is not a person's file. */
export const PUBLIC_MEDIA_PLACEHOLDER = "users/default.png";

export function isSafeMediaPath(path: string): boolean {
  if (!SAFE_PATH.test(path) || path.includes("..") || path.includes("\\")) return false;
  if (path === PUBLIC_MEDIA_PLACEHOLDER) return true;
  if (!path.includes("/")) return false;
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.includes(".");
}

/** Full access or the uploader may read a stored file before it is linked to a record. */
export function storedFileBypass(user: AccessUser, createdBy: number | null): boolean {
  if (user.status && user.status !== "A") return false;
  if (hasFullAccess(user)) return true;
  return createdBy != null && createdBy === user.id;
}
