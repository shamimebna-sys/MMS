import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasFullAccess, hasGrant, hasPermission, type AccessUser } from "@/lib/auth/permissions";
import { getCurrentUser, sessionAvatar, sessionEmail, sessionRoleLabel } from "@/server/current-user";
import WorkspaceLayout from "@/app/(workspace)/layout";
import PartyLayout from "@/app/(party)/layout";
import CandidateHomeLayout from "@/app/(portal)/candidate/(home)/layout";
import CandidateProfilePage from "@/app/(portal)/candidate/(home)/profile/page";
import DashboardPage from "@/app/(workspace)/dashboard/page";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verify: vi.fn(),
  findUnique: vi.fn(),
  query: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  loadDashboard: vi.fn(),
  loadCandidatePortal: vi.fn(),
  queries: [] as Array<{ sql: string; params: unknown[] | undefined }>,
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
  pool: { query: mocks.query },
}));

vi.mock("@/server/dashboard", async () => {
  const actual = await vi.importActual<typeof import("@/server/dashboard")>("@/server/dashboard");
  return { ...actual, loadDashboard: mocks.loadDashboard };
});

vi.mock("@/server/candidate-portal", () => ({
  loadCandidatePortal: mocks.loadCandidatePortal,
}));

vi.mock("@/components/shell/app-shell", () => ({
  AppShell: (props: {
    userName: string;
    userEmail: string;
    userAvatar: string;
    unread?: number;
    groups: Array<{ title: string; items: Array<{ href: string; label: string }> }>;
    children?: ReactNode;
  }) =>
    createElement(
      "section",
      null,
      createElement("p", { id: "user-name" }, props.userName),
      createElement("p", { id: "user-email" }, props.userEmail || "(empty)"),
      createElement("p", { id: "user-avatar" }, props.userAvatar || "(empty)"),
      createElement("p", { id: "unread" }, String(props.unread ?? "")),
      createElement(
        "ul",
        { id: "menu" },
        props.groups.flatMap((group) => group.items.map((item) => createElement("li", { key: item.href }, item.label))),
      ),
      props.children,
    ),
}));

vi.mock("@/components/candidate/profile-editor", () => ({
  CandidateProfileEditor: (props: { email: string; avatar: string }) =>
    createElement("div", { id: "profile-editor" }, `email=${props.email || "(empty)"}`, ` avatar=${props.avatar || "(empty)"}`),
}));

vi.mock("@/components/dashboard/pipeline-chart", () => ({
  PipelineChart: () => null,
}));

vi.mock("@/components/dashboard/congratulations-carousel", () => ({
  CongratulationsCarousel: () => null,
}));

const future = new Date(Date.now() + 60_000);

const MENU_ROWS = [
  { id: 10, title: "Records", url: "", route: null, parent_id: null, order: 1 },
  { id: 11, title: "Candidates", url: "", route: "voyager.candidates.index", parent_id: 10, order: 1 },
  { id: 12, title: "Settings", url: "", route: "voyager.settings.index", parent_id: 10, order: 2 },
];

const DATA_TYPES = [
  { slug: "candidates", name: "candidates" },
  { slug: "settings", name: "settings" },
];

const DASHBOARD = {
  pipeline: {
    registration: 0,
    profileCv: 0,
    grouped: 0,
    selection: 0,
    labour: 0,
    police: 0,
    medical: 0,
    visa: 0,
    manpower: 0,
    flight: 0,
    exams: 0,
  },
  money: [],
  agentBalance: "0",
  totalCandidates: 0,
  totalAgents: 0,
  selected: [],
  roster: null,
  classes: [],
  interviews: [],
  flights: [],
  announcements: [],
};

function account(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: 7,
    name: "Ada",
    roleName: "Employee",
    permissions: [],
    agentId: null,
    subAgentId: null,
    candidateId: null,
    agencierId: null,
    companierId: null,
    status: "A",
    ...overrides,
  };
}

function signIn(user: Record<string, unknown> = {}, userId = 7) {
  mocks.cookieGet.mockReturnValue({ value: "token" });
  mocks.verify.mockResolvedValue({ sid: "sid-1", sub: userId, abs: Math.floor(future.getTime() / 1000) });
  mocks.findUnique.mockResolvedValue({
    revokedAt: null,
    userId,
    absoluteExpiresAt: future,
    user: {
      id: userId,
      name: "Ada",
      status: "A",
      email: "ada@example.com",
      avatar: "/avatars/ada.png",
      agentId: null,
      subAgentId: null,
      candidateId: null,
      agencierId: null,
      companierId: null,
      roleIdRef: {
        name: "Employee",
        displayName: "Field Officer",
        permissionRoleLinks0: [{ permissionIdRef: { key: "browse_candidates" } }],
      },
      ...user,
    },
  });
}

function sqlText(): string {
  return mocks.queries.map((call) => call.sql).join("\n");
}

beforeEach(() => {
  mocks.cookieGet.mockReset();
  mocks.verify.mockReset();
  mocks.findUnique.mockReset();
  mocks.query.mockReset();
  mocks.redirect.mockClear();
  mocks.loadDashboard.mockReset();
  mocks.loadCandidatePortal.mockReset();
  mocks.queries.length = 0;
  mocks.loadDashboard.mockResolvedValue(DASHBOARD);
  mocks.loadCandidatePortal.mockResolvedValue({ name: "Amina" });
  mocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    mocks.queries.push({ sql, params });
    if (/from\s+users\b/i.test(sql)) throw new Error(`redundant identity read: ${sql}`);
    if (/display_name/i.test(sql)) throw new Error(`redundant role read: ${sql}`);
    if (sql.includes("notifications")) return { rows: [{ count: 4 }] };
    if (sql.includes("menu_items")) return { rows: MENU_ROWS };
    if (sql.includes("data_types")) return { rows: DATA_TYPES };
    if (sql.includes("FROM candidates")) return { rows: [{ dob: "" }] };
    throw new Error(`unexpected query: ${sql}`);
  });
});

describe("session identity display values", () => {
  it("trims email and avatar and falls back when they are missing", () => {
    expect(sessionEmail(account({ email: "  ada@example.com  " }))).toBe("ada@example.com");
    expect(sessionEmail(account({ email: null }))).toBe("");
    expect(sessionEmail(account({ email: "   " }))).toBe("");
    expect(sessionEmail(account())).toBe("");
    expect(sessionAvatar(account({ avatar: "  /avatars/ada.png  " }))).toBe("/avatars/ada.png");
    expect(sessionAvatar(account({ avatar: null }))).toBe("");
    expect(sessionAvatar(account())).toBe("");
  });

  it("prefers the role display name and falls back to the role name", () => {
    expect(sessionRoleLabel(account({ roleDisplayName: "  Desk Lead  ", roleName: "Employee" }))).toBe("Desk Lead");
    expect(sessionRoleLabel(account({ roleDisplayName: "   ", roleName: "  Employee  " }))).toBe("Employee");
    expect(sessionRoleLabel(account({ roleDisplayName: null, roleName: null }))).toBe("");
    expect(sessionRoleLabel(account({ roleDisplayName: null, roleName: "admin" }))).toBe("admin");
  });

  it("does not let email, avatar, or role display name change grants", () => {
    const presenter = account({
      email: "ada@example.com",
      avatar: "/avatars/ada.png",
      roleName: "Employee",
      roleDisplayName: "sadmin",
      permissions: [],
    });
    expect(hasFullAccess(presenter)).toBe(false);
    expect(hasGrant(presenter, "browse_candidates")).toBe(false);
    expect(hasPermission(presenter, "browse_candidates")).toBe(false);

    const admin = account({ roleName: "admin", roleDisplayName: "Intern", permissions: [], email: "admin@example.com" });
    expect(hasFullAccess(admin)).toBe(true);
    expect(hasGrant(admin, "browse_candidates")).toBe(false);
    expect(hasPermission(admin, "browse_candidates")).toBe(true);
  });
});

describe("authenticated session identity reads", () => {
  it("keeps permission keys from the session and ignores the display name", async () => {
    signIn();
    const user = await getCurrentUser();
    expect(user).toMatchObject({
      id: 7,
      email: "ada@example.com",
      avatar: "/avatars/ada.png",
      roleName: "Employee",
      roleDisplayName: "Field Officer",
      permissions: ["browse_candidates"],
    });
    expect(hasGrant(user!, "browse_candidates")).toBe(true);
    expect(hasGrant(user!, "browse_settings")).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("still rejects an inactive account that has an email on the row", async () => {
    signIn({ status: "B", email: "gone@example.com" });
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("shows the session email and avatar on the staff shell without another users query", async () => {
    signIn({ email: "  ada@example.com  ", avatar: "  /avatars/ada.png  " }, 9);
    const html = renderToStaticMarkup(await WorkspaceLayout({ children: null }));
    expect(html).toContain("ada@example.com");
    expect(html).toContain("/avatars/ada.png");
    expect(html).toContain("Candidates");
    expect(html).not.toContain("Settings");
    expect(html).toContain(">4<");
    expect(mocks.queries.map((call) => call.sql).some((sql) => sql.includes("notifications"))).toBe(true);
    expect(mocks.queries.map((call) => call.sql).some((sql) => sql.includes("menu_items"))).toBe(true);
    expect(mocks.queries.map((call) => call.sql).some((sql) => sql.includes("data_types"))).toBe(true);
    expect(mocks.queries).toHaveLength(3);
    expect(mocks.queries[0]?.params).toEqual([9]);
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
    expect(sqlText()).not.toMatch(/display_name/i);
  });

  it("keeps a menu item hidden when the session has no grant", async () => {
    signIn({
      roleIdRef: {
        name: "admin",
        displayName: "Administrator",
        permissionRoleLinks0: [],
      },
    });
    const html = renderToStaticMarkup(await WorkspaceLayout({ children: null }));
    expect(html).toContain("ada@example.com");
    expect(html).not.toContain("Candidates");
    expect(html).not.toContain("Settings");
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
  });

  it("uses the session role display name on the dashboard and does not query roles", async () => {
    signIn({
      roleIdRef: {
        name: "Employee",
        displayName: "  Desk Lead  ",
        permissionRoleLinks0: [],
      },
    });
    mocks.query.mockClear();
    mocks.queries.length = 0;
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Desk Lead");
    expect(html).not.toContain("Super Admin");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("falls back to the role name when the session display name is blank", async () => {
    signIn({
      roleIdRef: {
        name: "  Employee  ",
        displayName: "   ",
        permissionRoleLinks0: [],
      },
    });
    mocks.query.mockClear();
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Employee");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("leaves the dashboard heading empty when the session has no role label", async () => {
    signIn({
      roleIdRef: null,
    });
    mocks.query.mockClear();
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).not.toContain("Field Officer");
    expect(html).not.toContain("Super Admin");
    expect(html).not.toContain("Employee");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("shows the company session identity without a users query", async () => {
    signIn({
      email: "co@example.com",
      avatar: null,
      companierId: 3,
      roleIdRef: { name: "Company", displayName: "Company Desk", permissionRoleLinks0: [] },
    });
    const html = renderToStaticMarkup(await PartyLayout({ children: null }));
    expect(html).toContain("co@example.com");
    expect(html).toContain("(empty)");
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0]?.sql).toContain("notifications");
    expect(mocks.queries[0]?.params).toEqual([7]);
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
  });

  it("shows the candidate session identity without a users query", async () => {
    signIn({
      name: "Amina",
      email: "amina@example.com",
      avatar: "/c.png",
      candidateId: 18,
      roleIdRef: { name: "Candidate", displayName: "Candidate", permissionRoleLinks0: [] },
    });
    const html = renderToStaticMarkup(await CandidateHomeLayout({ children: null }));
    expect(html).toContain("amina@example.com");
    expect(html).toContain("/c.png");
    expect(html).toContain("Edit profile");
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0]?.sql).toContain("notifications");
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
  });

  it("fills the candidate profile from the session when the file has no email", async () => {
    signIn({
      email: "  sign@example.com ",
      avatar: "  /avatars/ada.png ",
      candidateId: 18,
      roleIdRef: { name: "Candidate", displayName: "Candidate", permissionRoleLinks0: [] },
    });
    mocks.loadCandidatePortal.mockResolvedValue({
      name: "Amina",
      code: "C-18",
      photoRef: "",
      liveStatus: "Registration",
      stages: [],
      profile: [
        { label: "Email", value: "" },
        { label: "Mobile", value: "017" },
      ],
      application: [],
      documents: [],
      process: [],
    });
    const html = renderToStaticMarkup(await CandidateProfilePage());
    expect(html).toContain("email=sign@example.com");
    expect(html).toContain("avatar=/avatars/ada.png");
    expect(mocks.queries).toHaveLength(1);
    expect(mocks.queries[0]?.sql).toContain("FROM candidates");
    expect(mocks.queries[0]?.params).toEqual([18]);
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
  });

  it("keeps the candidate file email ahead of the session email", async () => {
    signIn({
      email: "sign@example.com",
      avatar: null,
      candidateId: 18,
      roleIdRef: { name: "Candidate", displayName: "Candidate", permissionRoleLinks0: [] },
    });
    mocks.loadCandidatePortal.mockResolvedValue({
      name: "Amina",
      code: "C-18",
      photoRef: "",
      liveStatus: "Registration",
      profile: [{ label: "Email", value: "file@example.com" }],
      application: [],
      documents: [],
      process: [],
    });
    const html = renderToStaticMarkup(await CandidateProfilePage());
    expect(html).toContain("email=file@example.com");
    expect(html).toContain("avatar=(empty)");
    expect(sqlText()).not.toMatch(/from\s+users\b/i);
  });
});

describe("unauthenticated and unauthorized identity paths", () => {
  it("sends an anonymous staff request to login before any query", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(WorkspaceLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not render a revoked session's email", async () => {
    signIn({ email: "revoked@example.com" });
    mocks.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      userId: 7,
      absoluteExpiresAt: future,
      user: { id: 7, email: "revoked@example.com", status: "A", roleIdRef: null },
    });
    await expect(WorkspaceLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("redirects a linked candidate away from the staff desk before shell queries", async () => {
    signIn({
      candidateId: 18,
      roleIdRef: { name: "Candidate", displayName: "Candidate", permissionRoleLinks0: [] },
    });
    await expect(WorkspaceLayout({ children: null })).rejects.toThrow("REDIRECT:/candidate");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("restricts a candidate with no linked file before shell queries", async () => {
    signIn({
      candidateId: null,
      roleIdRef: { name: "Candidate", displayName: "Candidate", permissionRoleLinks0: [] },
    });
    const html = renderToStaticMarkup(await WorkspaceLayout({ children: null }));
    expect(html).toContain("Access Restricted");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("sends a staff role away from the party shell", async () => {
    signIn();
    await expect(PartyLayout({ children: null })).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("sends an anonymous candidate request to login", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(CandidateHomeLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.loadCandidatePortal).not.toHaveBeenCalled();
  });

  it("sends a non-candidate away from the candidate shell", async () => {
    signIn();
    await expect(CandidateHomeLayout({ children: null })).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.loadCandidatePortal).not.toHaveBeenCalled();
  });

  it("does not query identity for an anonymous profile request", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    await expect(CandidateProfilePage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not query identity when the profile viewer is not a candidate", async () => {
    signIn();
    await expect(CandidateProfilePage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
