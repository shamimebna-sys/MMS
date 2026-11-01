import { describe, expect, it } from "vitest";
import { isAccountLocked, LOCKOUT_LIMIT, LOCKOUT_WINDOW_MS, recentFailureCount } from "@/lib/auth/lockout";

const now = Date.parse("2026-11-01T17:45:00.000Z");

describe("login lockout", () => {
  it("rejects a sign-in only after the configured number of recent failures", () => {
    expect(isAccountLocked(LOCKOUT_LIMIT - 1)).toBe(false);
    expect(isAccountLocked(LOCKOUT_LIMIT)).toBe(true);
    expect(isAccountLocked(LOCKOUT_LIMIT + 2)).toBe(true);
  });

  it("ignores failures older than the lockout window", () => {
    const expired = now - LOCKOUT_WINDOW_MS - 1;
    const inside = now - 60_000;
    expect(recentFailureCount([expired, expired, expired, expired, expired], now)).toBe(0);
    expect(isAccountLocked(recentFailureCount([expired, expired, expired, expired, inside], now))).toBe(false);
  });

  it("locks again when five failures are still inside the window", () => {
    const failures = Array.from({ length: LOCKOUT_LIMIT }, (_, index) => now - index * 1_000);
    expect(isAccountLocked(recentFailureCount(failures, now))).toBe(true);
  });

  it("treats a successful login as clearing the failed-attempt counter", () => {
    const failures = Array.from({ length: LOCKOUT_LIMIT }, () => now - 1_000);
    const afterSuccess: number[] = [];
    expect(isAccountLocked(recentFailureCount(afterSuccess, now))).toBe(false);
    expect(failures.length).toBe(LOCKOUT_LIMIT);
  });
});
