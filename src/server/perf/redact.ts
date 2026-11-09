const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+?\d{8,}$/;
const DIGITS = /^\d{3,}$/;
const PASSPORT = /^[A-Za-z]{1,3}\d{6,}$/;
const LONG_TOKEN = /^[A-Za-z0-9_-]{20,}$/;

export type RequestKind = "page" | "route_handler" | "server_action" | "unknown";

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Path only. Query strings and fragments are dropped before any logging. */
export function safeRoute(url: string | undefined): string {
  const raw = typeof url === "string" ? url : "/";
  const path = raw.split("?")[0]?.split("#")[0] ?? "/";
  if (!path.startsWith("/")) return "/";
  const route = path
    .split("/")
    .map((part, index) => (index === 0 ? "" : redactSegment(part)))
    .join("/");
  if (!route || route === "") return "/";
  return route.length > 180 ? route.slice(0, 180) : route;
}

export function safeMethod(method: string | undefined): string {
  if (!method) return "UNKNOWN";
  const upper = method.toUpperCase();
  return METHODS.has(upper) ? upper : "UNKNOWN";
}

function redactSegment(segment: string): string {
  let value = segment;
  try {
    value = decodeURIComponent(segment);
  } catch {
    value = segment;
  }
  if (value.includes("@")) return ":email";
  if (PHONE.test(value)) return ":phone";
  if (UUID.test(value)) return ":id";
  if (DIGITS.test(value)) return ":id";
  if (PASSPORT.test(value)) return ":id";
  if (LONG_TOKEN.test(value) || value.length > 64) return ":token";
  if (/[\r\n\t]/.test(value)) return ":token";
  return value;
}
