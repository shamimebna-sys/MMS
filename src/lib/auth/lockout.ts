export const LOCKOUT_LIMIT = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MESSAGE = "This account is locked for 15 minutes.";

export function lockoutWindowStart(now = Date.now()): Date {
  return new Date(now - LOCKOUT_WINDOW_MS);
}

/** Recent failed attempts at or above the limit lock the account. A successful login clears them. */
export function isAccountLocked(recentFailures: number): boolean {
  return recentFailures >= LOCKOUT_LIMIT;
}

export function recentFailureCount(failureTimes: readonly number[], now: number): number {
  const since = now - LOCKOUT_WINDOW_MS;
  return failureTimes.filter((time) => time > since).length;
}
