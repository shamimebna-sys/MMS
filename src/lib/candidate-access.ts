import { isPartyLandingPath, partyLanding } from "@/lib/role-landing";

export function isCandidateRole(roleName: string | null): boolean {
  return roleName === "Candidate";
}

/** Post-login path from the shared sign-in. Role and the linked record decide the landing page. */
export function loginDestination(input: {
  roleName: string | null;
  candidateId: number | null;
  requested: string;
}): { href: string } {
  const landing = partyLanding(input.roleName);
  if (landing) return { href: landing };
  const linked = isCandidateRole(input.roleName) && input.candidateId != null;
  if (linked) {
    if (isCandidatePath(input.requested)) return { href: input.requested };
    return { href: "/candidate" };
  }
  if (input.requested === "/candidate" || input.requested.startsWith("/candidate/")) {
    return { href: "/dashboard" };
  }
  if (isPartyLandingPath(input.requested)) return { href: "/dashboard" };
  return { href: input.requested || "/dashboard" };
}

/** Sidebar entries for a signed-in candidate. Dashboard is the shell home item. */
export function candidateNavigation(): Array<{ title: string; items: Array<{ href: string; label: string }> }> {
  return [
    { title: "Edit profile", items: [{ href: "/candidate/profile", label: "Edit profile" }] },
    { title: "Notices", items: [{ href: "/candidate/notices", label: "Notices" }] },
  ];
}

function isCandidatePath(path: string): boolean {
  if (path === "/candidate") return true;
  return path.startsWith("/candidate/") && !path.startsWith("/candidate/login");
}

export type OwnedFileRef =
  | { kind: "profile"; key: ProfileFileKey; index: number }
  | { kind: "document"; id: number; index: number }
  | { kind: "labour"; id: number; index: number }
  | { kind: "police"; id: number; index: number }
  | { kind: "medical"; id: number; index: number }
  | { kind: "visa"; id: number; index: number }
  | { kind: "arc"; id: number; index: number }
  | { kind: "manpower"; column: "certificate" | "paper" | "fingerprint"; id: number; index: number }
  | { kind: "flight"; column: "ticket" | "seal"; id: number; index: number };

const PROFILE_KEYS = ["cv", "nid", "passport", "stamp", "photo", "full-photo", "skill", "bid"] as const;
export type ProfileFileKey = (typeof PROFILE_KEYS)[number];

function fileIndex(value: string | undefined): number | null {
  if (value == null || value === "") return 0;
  if (!/^\d+$/.test(value)) return null;
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0 || index > 20) return null;
  return index;
}

function rowId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id)) return null;
  return id;
}

/** Parses a file reference. Ownership always comes from the signed-in account, never from this string. */
export function parseOwnedFileRef(ref: string): OwnedFileRef | null {
  const value = ref.trim();
  const profile = value.match(/^profile\.(cv|nid|passport|stamp|photo|full-photo|skill|bid)(?:\.(\d+))?$/);
  if (profile) {
    const key = profile[1];
    const index = fileIndex(profile[2]);
    if (!key || index == null || !PROFILE_KEYS.includes(key as ProfileFileKey)) return null;
    return { kind: "profile", key: key as ProfileFileKey, index };
  }
  const simple = value.match(/^(document|labour|police|medical|visa|arc)\.([1-9]\d*)(?:\.(\d+))?$/);
  if (simple) {
    const kind = simple[1];
    const id = rowId(simple[2] ?? "");
    const index = fileIndex(simple[3]);
    if (!kind || id == null || index == null) return null;
    if (kind === "document") return { kind: "document", id, index };
    if (kind === "labour") return { kind: "labour", id, index };
    if (kind === "police") return { kind: "police", id, index };
    if (kind === "medical") return { kind: "medical", id, index };
    if (kind === "visa") return { kind: "visa", id, index };
    return { kind: "arc", id, index };
  }
  const manpower = value.match(/^manpower\.(certificate|paper|fingerprint)\.([1-9]\d*)(?:\.(\d+))?$/);
  if (manpower) {
    const column = manpower[1];
    const id = rowId(manpower[2] ?? "");
    const index = fileIndex(manpower[3]);
    if ((column !== "certificate" && column !== "paper" && column !== "fingerprint") || id == null || index == null) return null;
    return { kind: "manpower", column, id, index };
  }
  const flight = value.match(/^flight\.(ticket|seal)\.([1-9]\d*)(?:\.(\d+))?$/);
  if (flight) {
    const column = flight[1];
    const id = rowId(flight[2] ?? "");
    const index = fileIndex(flight[3]);
    if ((column !== "ticket" && column !== "seal") || id == null || index == null) return null;
    return { kind: "flight", column, id, index };
  }
  return null;
}
