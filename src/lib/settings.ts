import { hasGrant, type AccessUser } from "@/lib/auth/permissions";

/** The ten keys stored in the legacy `settings` dump. No other key is writable. */
export const LEGACY_SETTING_KEYS = [
  "site.title",
  "site.description",
  "site.logo",
  "site.google_analytics_tracking_id",
  "admin.bg_image",
  "admin.title",
  "admin.description",
  "admin.loader",
  "admin.icon_image",
  "admin.google_analytics_client_id",
] as const;

export type LegacySettingKey = (typeof LEGACY_SETTING_KEYS)[number];

const KEYS = new Set<string>(LEGACY_SETTING_KEYS);
const MAX_VALUE_LENGTH = 4000;

export function isLegacySettingKey(key: string): key is LegacySettingKey {
  return KEYS.has(key);
}

export function isSettingsSlug(slug: string): boolean {
  return slug === "settings";
}

/** Settings entry follows the stored grant, the same rule as the settings list. */
export function canOperateSetting(user: AccessUser, action: "browse" | "read" | "edit"): boolean {
  return hasGrant(user, `${action}_settings`);
}

export function settingValueError(value: string, type: "text" | "image"): string | null {
  if (value.includes("\0")) return "Enter a valid setting value.";
  if (value.length > MAX_VALUE_LENGTH) return "This setting value is too long.";
  if (type === "image" && /[\r\n]/.test(value)) return "Enter a valid setting value.";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return "Enter a valid setting value.";
  }
  return null;
}

/**
 * Empty input keeps a stored NULL. An empty string that is already stored stays an empty string.
 * Any other submitted text is stored unchanged, including backslash paths.
 */
export function nextSettingValue(current: string | null, submitted: string, type: "text" | "image"): string | null {
  const error = settingValueError(submitted, type);
  if (error) throw new Error(error);
  if (submitted === "" && current === null) return null;
  return submitted;
}
