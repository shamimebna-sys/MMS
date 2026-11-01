import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STORAGE_ROOT = (process.env.LEGACY_STORAGE_URL || "https://eujobbd.com/storage").replace(/\/$/, "");
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,240}$/;

/** Same-origin stand-in for Voyager storage so photos render under the app content policy. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("path") ?? "";
  const path = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!SAFE_PATH.test(path) || path.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const upstream = await fetch(`${STORAGE_ROOT}/${path}`, { redirect: "error" });
  if (!upstream.ok || !upstream.body) return new NextResponse("Not found", { status: 404 });
  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/") && type !== "application/pdf") {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
