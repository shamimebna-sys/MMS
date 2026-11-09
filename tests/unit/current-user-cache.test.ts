import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, requireUser } from "@/server/current-user";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verify: vi.fn(),
  findUnique: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/jwt", () => ({
  SESSION_COOKIE: "mms_session",
  verifySessionToken: mocks.verify,
}));

vi.mock("@/lib/db", () => ({
  prisma: { session: { findUnique: mocks.findUnique } },
}));

const future = new Date(Date.now() + 60_000);

function session(overrides: Record<string, unknown> = {}) {
  return {
    revokedAt: null,
    userId: 7,
    absoluteExpiresAt: future,
    user: {
      id: 7,
      name: "Load User",
      status: "A",
      agentId: null,
      subAgentId: null,
      candidateId: null,
      agencierId: null,
      companierId: null,
      roleIdRef: { name: "admin", permissionRoleLinks0: [{ permissionIdRef: { key: "browse_candidates" } }] },
    },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.cookieGet.mockReset();
  mocks.verify.mockReset();
  mocks.findUnique.mockReset();
  mocks.redirect.mockClear();
  mocks.cookieGet.mockReturnValue({ value: "token" });
  mocks.verify.mockResolvedValue({ sid: "sid-1", sub: 7, abs: Math.floor(future.getTime() / 1000) });
  mocks.findUnique.mockResolvedValue(session());
});

describe("getCurrentUser request lookup", () => {
  it("does not query when the session cookie is missing", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("loads the session on every call outside a React request", async () => {
    const first = await getCurrentUser();
    const second = await getCurrentUser();
    expect(first?.id).toBe(7);
    expect(second?.permissions).toEqual(["browse_candidates"]);
    expect(mocks.findUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects a revoked session, a different user, and an inactive account", async () => {
    mocks.findUnique.mockResolvedValueOnce(session({ revokedAt: new Date() }));
    await expect(getCurrentUser()).resolves.toBeNull();

    mocks.findUnique.mockResolvedValueOnce(session({ userId: 8 }));
    await expect(getCurrentUser()).resolves.toBeNull();

    mocks.findUnique.mockResolvedValueOnce(session({ user: { ...session().user, status: "B" } }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("sends an anonymous caller to login", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("copies email, avatar, and role display name from the authenticated session row", async () => {
    mocks.findUnique.mockResolvedValue(
      session({
        user: {
          ...session().user,
          email: " ada@example.com ",
          avatar: " /avatars/ada.png ",
          roleIdRef: {
            name: "Employee",
            displayName: " Desk Officer ",
            permissionRoleLinks0: [{ permissionIdRef: { key: "browse_candidates" } }],
          },
        },
      }),
    );

    const user = await getCurrentUser();

    expect(user).toMatchObject({
      id: 7,
      email: " ada@example.com ",
      avatar: " /avatars/ada.png ",
      roleDisplayName: " Desk Officer ",
      roleName: "Employee",
      permissions: ["browse_candidates"],
    });
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "sid-1" },
      include: {
        user: {
          include: {
            roleIdRef: {
              include: {
                permissionRoleLinks0: { include: { permissionIdRef: true } },
              },
            },
          },
        },
      },
    });
  });

  it("preserves a null avatar and a missing role display name", async () => {
    mocks.findUnique.mockResolvedValue(
      session({
        user: {
          ...session().user,
          email: "ada@example.com",
          avatar: null,
          roleIdRef: null,
        },
      }),
    );

    await expect(getCurrentUser()).resolves.toMatchObject({
      email: "ada@example.com",
      avatar: null,
      roleDisplayName: null,
      roleName: null,
      permissions: [],
    });
  });

  it("does not return another user's email when the session user does not match the token", async () => {
    mocks.findUnique.mockResolvedValue(
      session({
        userId: 8,
        user: { ...session().user, id: 8, email: "other@example.com", avatar: "/other.png" },
      }),
    );

    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });
});
