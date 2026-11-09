import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, signSessionToken, verifySessionToken } from "@/lib/auth/jwt";

const PUBLIC_PATHS = new Set(["/login", "/forgot-password", "/reset-password", "/api/health"]);

const PUBLIC_PAGES = new Set(["/", "/about", "/faq", "/contact", "/candidates", "/jobs", "/news", "/privacy", "/terms"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PAGES.has(pathname)) return true;
  if (pathname.startsWith("/jobs/") || pathname.startsWith("/news/")) return true;
  if (pathname === "/api/media") return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/candidate/login") {
    const login = new URL("/login", request.url);
    const next = request.nextUrl.searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/candidate/login")) {
      login.searchParams.set("next", next);
    }
    return NextResponse.redirect(login);
  }
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  if (!claims || claims.abs * 1000 <= Date.now()) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    const response = NextResponse.redirect(login);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const response = NextResponse.next();
  const remainingMs = claims.exp * 1000 - Date.now();
  if (remainingMs < 15 * 60 * 1000) {
    const renewed = await signSessionToken({
      sid: claims.sid,
      userId: claims.sub,
      absoluteExpiresAt: new Date(claims.abs * 1000),
    });
    response.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions(new Date(claims.abs * 1000)));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
