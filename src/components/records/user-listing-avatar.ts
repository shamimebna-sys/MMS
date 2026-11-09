import { mediaUrl } from "@/lib/media";

const STORED_FILE = /^\/api\/files\/[a-f0-9]{32}$/i;
const DEFAULT_AVATAR = "users/default.png";

/** Profile photos saved by this app are stored as `/api/files/{id}` with no extension. */
export function isStoredFileImageRef(value: string): boolean {
  return STORED_FILE.test(value.trim());
}

export function listingAvatarSrc(stored: string, failed: boolean): string {
  return failed ? mediaUrl(DEFAULT_AVATAR) : stored.trim();
}
