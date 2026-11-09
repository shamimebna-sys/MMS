/** Company and Employer have no staff panel. Their desk is the scoped dashboard, not the public home. */
export const COMPANY_LANDING = "/company";
export const EMPLOYER_LANDING = "/employer";

export function partyLanding(roleName: string | null): string | null {
  if (roleName === "Company") return COMPANY_LANDING;
  if (roleName === "Employer") return EMPLOYER_LANDING;
  return null;
}

export function pathnameOf(value: string): string {
  const bare = value.split("?")[0]?.split("#")[0] ?? "";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare;
}

export function isPartyLandingPath(value: string): boolean {
  const path = pathnameOf(value);
  return (
    path === COMPANY_LANDING ||
    path === EMPLOYER_LANDING ||
    path.startsWith(`${COMPANY_LANDING}/`) ||
    path.startsWith(`${EMPLOYER_LANDING}/`)
  );
}

export type WorkspaceGate =
  | { action: "shell" }
  | { action: "redirect"; href: string }
  | { action: "restricted" };

/**
 * Company may open only `/company`. Employer may open only `/employer`.
 * The staff desk (`/dashboard` and the other workspace routes) stays with the other roles.
 * A linked candidate still leaves for `/candidate`.
 */
export function workspaceGate(input: {
  roleName: string | null;
  candidateId: number | null;
  pathname: string;
}): WorkspaceGate {
  if (input.roleName === "Candidate") {
    if (input.candidateId != null) return { action: "redirect", href: "/candidate" };
    return { action: "restricted" };
  }
  const landing = partyLanding(input.roleName);
  const path = pathnameOf(input.pathname);
  if (landing) {
    if (path === landing) return { action: "shell" };
    return { action: "redirect", href: landing };
  }
  if (path === COMPANY_LANDING || path === EMPLOYER_LANDING || path.startsWith(`${COMPANY_LANDING}/`) || path.startsWith(`${EMPLOYER_LANDING}/`)) {
    return { action: "redirect", href: "/dashboard" };
  }
  return { action: "shell" };
}

/** Every staff-desk route. Company and Employer are sent to their own landing. */
export function staffDeskGate(roleName: string | null, candidateId: number | null): WorkspaceGate {
  return workspaceGate({ roleName, candidateId, pathname: "/dashboard" });
}
