import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/current-user";
import { canReadMediaPath } from "@/server/media-access";

export const dynamic = "force-dynamic";

const STORAGE_ROOT = (process.env.LEGACY_STORAGE_URL || "https://eujobbd.com/storage").replace(/\/$/, "");

/** Same-origin stand-in for Voyager storage. Public files stay public. Every other file needs a matching record in scope. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("path") ?? "";
  const path = decodeURIComponent(raw).replace(/^\/+/, "");
  const user = await getCurrentUser();
  if (!(await canReadMediaPath(user, path))) {
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
