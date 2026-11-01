const STORAGE_ROOT = (process.env.LEGACY_STORAGE_URL || "https://eujobbd.com/storage").replace(/\/$/, "");

function storagePath(value: string): string {
  if (value.startsWith(`${STORAGE_ROOT}/`)) return value.slice(STORAGE_ROOT.length + 1);
  return value.replace(/^\/+/, "");
}

/** Voyager stores files as `candidates/May2025/file.jpg`. Serve them from this app so the content policy allows the image. */
export function mediaUrl(path: string | null | undefined): string {
  const value = (path ?? "").trim();
  if (!value) return "";
  if (value.startsWith("/api/")) return value;
  const relative = storagePath(value);
  if (!relative || relative.includes("..") || relative.startsWith("http://") || relative.startsWith("https://")) return "";
  return `/api/media?path=${encodeURIComponent(relative)}`;
}

export function isImagePath(path: string | null | undefined): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test((path ?? "").trim());
}

export function storedFiles(value: string | null | undefined): Array<{ path: string; name: string }> {
  const text = (value ?? "").trim();
  if (!text || text === "[]") return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as Array<{ download_link?: string; original_name?: string }>;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({ path: String(item?.download_link ?? "").replace(/^\/+/, ""), name: String(item?.original_name ?? "") }))
          .filter((item) => item.path);
      }
    } catch {
      return [];
    }
  }
  const path = text.replace(/^\/+/, "");
  return path ? [{ path, name: path.split("/").pop() ?? path }] : [];
}
