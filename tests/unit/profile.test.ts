import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { authorizeOwnAccount, PROFILE_IMAGE_MAX_BYTES as CLIENT_LIMIT, profilePhotoSelectionError } from "@/features/profile/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prepareProfileImage, PROFILE_IMAGE_MAX_BYTES } from "@/server/profile-image";
import {
  removeProfilePhoto,
  runPasswordChange,
  runProfileUpdate,
  saveProfilePhoto,
  toPublicProfile,
  type ProfilePhotoDeps,
  type ProfileSource,
} from "@/server/profile";

const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function image(format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  const base = sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 40, b: 80 } } });
  if (format === "jpeg") return base.jpeg().toBuffer();
  if (format === "png") return base.png().toBuffer();
  return base.webp().toBuffer();
}

describe("profile retrieval", () => {
  it("returns account fields and leaves the password hash out", () => {
    const source = {
      name: " Shamim ",
      email: "shamim@example.com",
      status: "A",
      avatar: "users/photo.jpg",
      email_verified_at: null,
      role_name: "Agent",
      phone: "01700000000",
      designation: "Officer",
      agent_code: "A1",
      agent_name: "Office",
      agent_mobile: "018",
      agent_balance: "12.50",
      sub_code: null,
      sub_name: null,
      sub_balance: null,
      password: "secret-hash",
    } as ProfileSource & { password: string };
    const view = toPublicProfile(source, 9);
    expect(view).toMatchObject({
      id: 9,
      name: "Shamim",
      email: "shamim@example.com",
      role: "Agent",
      status: "Active",
      phone: "01700000000",
      designation: "Officer",
      agent: "A1 Office",
      emailVerified: false,
    });
    expect(view).not.toHaveProperty("password");
    expect(JSON.stringify(view)).not.toContain("secret-hash");
  });
});

describe("profile update", () => {
  function deps() {
    const saved: Array<{ name: string; email: string; clearEmailVerified: boolean }> = [];
    return {
      saved,
      repo: {
        findAccount: async () => ({ email: "shamim@example.com" }),
        emailTaken: async () => false,
        save: async (_id: number, data: { name: string; email: string; clearEmailVerified: boolean }) => {
          saved.push(data);
        },
      },
    };
  }

  it("saves the signed-in user's name and email", async () => {
    const { saved, repo } = deps();
    const result = await runProfileUpdate(4, "4", { name: "Shamim Ahmed", email: "shamim@example.com" }, repo);
    expect(result).toEqual({ ok: true, message: "Profile saved." });
    expect(saved).toEqual([{ name: "Shamim Ahmed", email: "shamim@example.com", clearEmailVerified: false }]);
  });

  it("marks a changed email unverified", async () => {
    const { saved, repo } = deps();
    const result = await runProfileUpdate(4, 4, { name: "Shamim", email: "new@example.com" }, repo);
    expect(result.ok).toBe(true);
    expect(saved[0]?.clearEmailVerified).toBe(true);
  });

  it("rejects an update when nobody is signed in", async () => {
    const { saved, repo } = deps();
    const result = await runProfileUpdate(null, 4, { name: "Shamim", email: "shamim@example.com" }, repo);
    expect(result).toEqual({ ok: false, error: "You need to sign in again." });
    expect(saved).toHaveLength(0);
  });

  it("rejects an update aimed at another account", async () => {
    const { saved, repo } = deps();
    const result = await runProfileUpdate(4, "9", { name: "Shamim", email: "shamim@example.com" }, repo);
    expect(result).toEqual({ ok: false, error: "You can only update your own account." });
    expect(saved).toHaveLength(0);
    expect(authorizeOwnAccount(4, 9).ok).toBe(false);
  });

  it("rejects protected account fields", async () => {
    const { saved, repo } = deps();
    const result = await runProfileUpdate(
      4,
      4,
      { name: "Shamim", email: "shamim@example.com", role: "Admin", status: "A", id: 4, password: "x" },
      repo,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot be changed/i);
    expect(saved).toHaveLength(0);
  });

  it("does not save an email that is already in use", async () => {
    const { saved, repo } = deps();
    repo.emailTaken = async () => true;
    const result = await runProfileUpdate(4, 4, { name: "Shamim", email: "taken@example.com" }, repo);
    expect(result).toEqual({ ok: false, error: "That email is already in use." });
    expect(saved).toHaveLength(0);
  });
});

describe("password change", () => {
  let currentHash = "";

  beforeAll(async () => {
    currentHash = await hashPassword("Current-password-1");
  });

  function deps() {
    const committed: string[] = [];
    return {
      committed,
      repo: {
        findPassword: async () => currentHash,
        commit: async (_id: number, passwordHash: string) => {
          committed.push(passwordHash);
        },
      },
    };
  }

  const next = "replacement-password";

  it("rejects a confirmation that does not match", async () => {
    const { committed, repo } = deps();
    let looked = false;
    repo.findPassword = async () => {
      looked = true;
      return currentHash;
    };
    const result = await runPasswordChange(4, 4, { currentPassword: "Current-password-1", newPassword: next, confirmPassword: "not-the-same-xx" }, repo);
    expect(result).toEqual({ ok: false, error: "New password and confirmation do not match." });
    expect(looked).toBe(false);
    expect(committed).toHaveLength(0);
  });

  it("rejects an incorrect current password", async () => {
    const { committed, repo } = deps();
    const result = await runPasswordChange(4, 4, { currentPassword: "wrong-password-x", newPassword: next, confirmPassword: next }, repo);
    expect(result).toEqual({ ok: false, error: "Current password is incorrect." });
    expect(committed).toHaveLength(0);
  });

  it("stores a new hash and does not return it", async () => {
    const { committed, repo } = deps();
    const result = await runPasswordChange(4, 4, { currentPassword: "Current-password-1", newPassword: next, confirmPassword: next }, repo);
    expect(result).toEqual({ ok: true, message: "Password updated. Other sessions were signed out." });
    expect(committed).toHaveLength(1);
    expect(committed[0]).not.toBe(next);
    expect(committed[0]?.startsWith("$2")).toBe(true);
    expect(await verifyPassword(next, committed[0] ?? "")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(next);
    expect(JSON.stringify(result)).not.toContain(committed[0]);
  });

  it("does not change another user's password", async () => {
    const { committed, repo } = deps();
    const result = await runPasswordChange(4, 8, { currentPassword: "Current-password-1", newPassword: next, confirmPassword: next }, repo);
    expect(result.ok).toBe(false);
    expect(committed).toHaveLength(0);
  });

  it("rejects a protected field sent with the password form", async () => {
    const { committed, repo } = deps();
    const result = await runPasswordChange(
      4,
      4,
      { currentPassword: "Current-password-1", newPassword: next, confirmPassword: next, role: "Admin" },
      repo,
    );
    expect(result.ok).toBe(false);
    expect(committed).toHaveLength(0);
  });
});

describe("profile photo", () => {
  it("rejects a selected file before upload when the type or size is not allowed", () => {
    expect(profilePhotoSelectionError({ size: 1200, type: "image/jpeg", name: "face.jpg" })).toBeNull();
    expect(profilePhotoSelectionError({ size: 1200, type: "image/png", name: "face.png" })).toBeNull();
    expect(profilePhotoSelectionError({ size: 1200, type: "image/webp", name: "face.webp" })).toBeNull();
    expect(profilePhotoSelectionError({ size: 1200, type: "", name: "face.JPEG" })).toBeNull();
    expect(profilePhotoSelectionError({ size: 1200, type: "image/gif", name: "face.gif" })).toMatch(/JPEG, PNG, or WebP/);
    expect(profilePhotoSelectionError({ size: 0, type: "image/jpeg", name: "face.jpg" })).toMatch(/5 MB/);
    expect(profilePhotoSelectionError({ size: CLIENT_LIMIT + 1, type: "image/png", name: "face.png" })).toMatch(/5 MB/);
  });

  it("rejects a file that is not a JPEG, PNG, or WebP", async () => {
    await expect(prepareProfileImage(Buffer.from("not-an-image"))).rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(prepareProfileImage(gif)).rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(prepareProfileImage(Buffer.from("%PDF-1.4"))).rejects.toThrow(/JPEG, PNG, or WebP/);
  });

  it("rejects an image over 5 MB", async () => {
    await expect(prepareProfileImage(Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 1, 1))).rejects.toThrow(/5 MB/);
  });

  it("accepts JPEG, PNG, and WebP contents", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const prepared = await prepareProfileImage(await image(format));
      expect(prepared.mimeType).toBe(format === "jpeg" ? "image/jpeg" : `image/${format}`);
      expect(prepared.bytes.length).toBeGreaterThan(0);
      expect(prepared.bytes.length).toBeLessThanOrEqual(PROFILE_IMAGE_MAX_BYTES);
    }
  });

  it("saves a replacement and deletes the previous stored file only after the write", async () => {
    const previous = `/api/files/${"b".repeat(32)}`;
    const events: string[] = [];
    const deps: ProfilePhotoDeps = {
      storeImage: async (prepared) => {
        expect(prepared.mimeType).toBe("image/jpeg");
        events.push("store");
        return { id: "a".repeat(32) };
      },
      readAvatar: async () => {
        events.push("read");
        return previous;
      },
      writeAvatar: async (avatar) => {
        events.push(`write:${avatar}`);
      },
      removeStoredFile: async (id) => {
        events.push(`delete:${id}`);
      },
    };
    const result = await saveProfilePhoto(deps, await image("jpeg"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.avatar).toBe(`/api/files/${"a".repeat(32)}`);
    expect(events).toEqual(["store", "read", `write:/api/files/${"a".repeat(32)}`, `delete:${"b".repeat(32)}`]);
  });

  it("keeps the existing photo when the new one cannot be committed", async () => {
    const removed: string[] = [];
    const deps: ProfilePhotoDeps = {
      storeImage: async () => ({ id: "c".repeat(32) }),
      readAvatar: async () => `/api/files/${"d".repeat(32)}`,
      writeAvatar: async () => {
        throw new Error("database down");
      },
      removeStoredFile: async (id) => {
        removed.push(id);
      },
    };
    const result = await saveProfilePhoto(deps, await image("png"));
    expect(result).toEqual({ ok: false, error: "Could not save the profile photo." });
    expect(removed).toEqual(["c".repeat(32)]);
  });

  it("does not delete a legacy storage path when removing a photo", async () => {
    const removed: string[] = [];
    const result = await removeProfilePhoto({
      readAvatar: async () => "agents/May2025/photo.jpg",
      writeAvatar: async () => undefined,
      removeStoredFile: async (id) => {
        removed.push(id);
      },
    });
    expect(result.ok).toBe(true);
    expect(removed).toHaveLength(0);
  });
});
