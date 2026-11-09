import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessUser } from "@/lib/auth/permissions";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const staff: AccessUser = {
  id: 7,
  name: "Staff",
  roleName: "Employee",
  permissions: [],
  agentId: null,
  subAgentId: null,
  candidateId: null,
  agencierId: null,
  companierId: null,
  status: "A",
};

const ip = "198.51.100.8";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requestIp: vi.fn(),
  submitBreadForm: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  prisma: {},
  closeDb: vi.fn(),
}));

vi.mock("@/server/current-user", () => ({
  requireUser: mocks.requireUser,
  requestIp: mocks.requestIp,
}));

vi.mock("@/server/bread-form", async () => {
  const actual = await vi.importActual<typeof import("@/server/bread-form")>("@/server/bread-form");
  return {
    ...actual,
    submitBreadForm: mocks.submitBreadForm,
  };
});

import { saveBreadFormAction } from "@/components/records/bread-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function redirectUrl(formData: FormData): Promise<string> {
  try {
    await saveBreadFormAction(formData);
  } catch (error) {
    if (!isRedirectError(error)) throw error;
    const url = getURLFromRedirectError(error);
    expect(url).toEqual(expect.any(String));
    return url;
  }
  throw new Error("saveBreadFormAction returned without redirecting.");
}

describe("saveBreadFormAction redirect handling", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.requestIp.mockReset();
    mocks.submitBreadForm.mockReset();
    mocks.requireUser.mockResolvedValue(staff);
    mocks.requestIp.mockResolvedValue(ip);
  });

  it("redirects a successful create to the created record", async () => {
    const data = form({ slug: "candidates", name: "Amina" });
    mocks.submitBreadForm.mockResolvedValue(15);

    const url = await redirectUrl(data);

    expect(url).toBe("/records/candidates/15");
    expect(url).not.toContain("NEXT_REDIRECT");
    expect(url).not.toContain("error=");
    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(1);
    expect(mocks.submitBreadForm).toHaveBeenCalledWith(staff, data, ip);
    expect(mocks.requireUser).toHaveBeenCalledTimes(1);
    expect(mocks.requestIp).toHaveBeenCalledTimes(1);
  });

  it("redirects a successful update to the updated record", async () => {
    const data = form({ slug: "jobs", id: "9", title: "Welder" });
    mocks.submitBreadForm.mockResolvedValue(9);

    const url = await redirectUrl(data);

    expect(url).toBe("/records/jobs/9");
    expect(url).not.toContain("NEXT_REDIRECT");
    expect(url).not.toContain("error=");
    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(1);
    expect(mocks.submitBreadForm).toHaveBeenCalledWith(staff, data, ip);
  });

  it("preserves stamp=Y on successful create and update redirects", async () => {
    const created = form({ slug: "candidates", stamp: "Y", name: "Amina" });
    mocks.submitBreadForm.mockResolvedValueOnce(15);
    await expect(redirectUrl(created)).resolves.toBe("/records/candidates/15?stamp=Y");

    const updated = form({ slug: "candidates", id: "9", stamp: "Y", name: "Amina" });
    mocks.submitBreadForm.mockResolvedValueOnce(9);
    await expect(redirectUrl(updated)).resolves.toBe("/records/candidates/9?stamp=Y");

    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(2);
  });

  it("keeps validation and database failures on the existing error redirect", async () => {
    const created = form({ slug: "candidates", name: "Amina", idempotency_key: "not-a-uuid" });
    mocks.submitBreadForm.mockRejectedValueOnce(new Error("Agent is required."));
    await expect(redirectUrl(created)).resolves.toBe("/records/candidates/new?error=Agent%20is%20required.");

    const updated = form({
      slug: "candidates",
      id: "9",
      stamp: "Y",
      name: "Amina",
      idempotency_key: idempotencyKey,
    });
    const databaseError = new Error("duplicate key value violates unique constraint");
    databaseError.name = "QueryError";
    mocks.submitBreadForm.mockRejectedValueOnce(databaseError);
    await expect(redirectUrl(updated)).resolves.toBe(
      `/records/candidates/9?error=${encodeURIComponent(databaseError.message)}&stamp=Y&idempotency_key=${idempotencyKey}`,
    );

    mocks.submitBreadForm.mockRejectedValueOnce("db down");
    await expect(redirectUrl(form({ slug: "payments" }))).resolves.toBe("/records/payments/new?error=Could%20not%20save.");

    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(3);
  });

  it("does not report a successful save as NEXT_REDIRECT and does not submit again", async () => {
    const data = form({ slug: "candidates", stamp: "Y", name: "Amina" });
    mocks.submitBreadForm.mockResolvedValue(42);

    const url = await redirectUrl(data);

    expect(url).toBe("/records/candidates/42?stamp=Y");
    expect(url).not.toContain("NEXT_REDIRECT");
    expect(url).not.toContain("error=");
    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(1);
    expect(mocks.submitBreadForm).toHaveBeenCalledWith(staff, data, ip);
  });

  it("still redirects a genuine NEXT_REDIRECT failure message and submits once", async () => {
    const data = form({ slug: "candidates", name: "Amina" });
    mocks.submitBreadForm.mockRejectedValue(new Error("NEXT_REDIRECT"));

    const url = await redirectUrl(data);

    expect(url).toBe("/records/candidates/new?error=NEXT_REDIRECT");
    expect(mocks.submitBreadForm).toHaveBeenCalledTimes(1);
    expect(mocks.submitBreadForm).toHaveBeenCalledWith(staff, data, ip);
  });

  it("leaves an authentication failure outside the save error redirect", async () => {
    mocks.requireUser.mockRejectedValue(new Error("session expired"));

    await expect(saveBreadFormAction(form({ slug: "candidates", name: "Amina" }))).rejects.toThrow("session expired");
    expect(mocks.submitBreadForm).not.toHaveBeenCalled();
    expect(mocks.requestIp).not.toHaveBeenCalled();
  });
});
