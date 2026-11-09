import { randomUUID } from "node:crypto";
import { Server, type IncomingMessage, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { isPerfEnabled } from "@/server/perf/config";
import { safeMethod, safeRoute, type RequestKind } from "@/server/perf/redact";
import {
  createRequestScope,
  discardRequestScope,
  finishRequestResponse,
  runWithRequestScope,
  type TrackedCheckout,
} from "@/server/perf/request-scope";
import { guard, perfState } from "@/server/perf/state";

/**
 * `proxy.ts` returns before server rendering finishes, and `onRequestError` runs
 * only for failures. Its `request.path` also includes the raw query string.
 * `register()` installs this timer on the Node HTTP server: from the `request`
 * event until the response finishes, which includes proxy work and rendering
 * inside this process. Time before the request reaches Node is not included.
 * Page vs route handler is exact for `/api` and for `next-action`. A route handler
 * outside `/api` is reported as a page on success.
 *
 * The same boundary enters the request scope. The sample stays unsealed until
 * the response finishes or closes and every checkout captured for that scope
 * has been released. The scope stores the route, method, and category, not
 * the request or response objects.
 */
export function installRequestInstrumentation(): void {
  if (!isPerfEnabled()) return;
  const current = perfState();
  if (current.httpInstalled) return;
  const proto = Server.prototype as Server & {
    emit: (this: Server, event: string | symbol, ...args: unknown[]) => boolean;
  };
  const original = proto.emit;
  current.originalEmit = original as unknown as typeof current.originalEmit;
  proto.emit = function emitWithRequestTiming(this: Server, event: string | symbol, ...args: unknown[]): boolean {
    if (event === "request" && isPerfEnabled()) {
      const scope = openRequest(args[0], args[1]);
      if (scope) return runWithRequestScope(scope, () => original.call(this, event, ...args));
    }
    return original.call(this, event, ...args);
  };
  current.httpInstalled = true;
}

export function uninstallRequestInstrumentation(): void {
  const current = perfState();
  if (!current.httpInstalled || !current.originalEmit) return;
  const proto = Server.prototype as Server & {
    emit: (this: Server, event: string | symbol, ...args: unknown[]) => boolean;
  };
  proto.emit = current.originalEmit as typeof proto.emit;
  current.originalEmit = null;
  current.httpInstalled = false;
}

function openRequest(reqValue: unknown, resValue: unknown): TrackedCheckout["scope"] | null {
  let scope: TrackedCheckout["scope"] | null = null;
  try {
    if (!isIncoming(reqValue) || !isServerResponse(resValue)) return null;
    const method = safeMethod(reqValue.method);
    const route = safeRoute(reqValue.url);
    scope = createRequestScope({
      id: randomUUID(),
      method,
      route,
      kind: classify(reqValue, route, method),
      startedAt: performance.now(),
    });
    bindResponse(scope, resValue);
    return scope;
  } catch {
    perfState().faults += 1;
    if (scope) discardRequestScope(scope);
    return null;
  }
}

function bindResponse(scope: TrackedCheckout["scope"], res: ServerResponse): void {
  let response: ServerResponse | null = res;
  let settled = false;
  const complete = (fromClose: boolean) => {
    if (settled) return;
    settled = true;
    const current = response;
    response = null;
    const status = current ? normalizeStatus(current.statusCode) : 0;
    const aborted = fromClose && !!current && !current.writableEnded && !current.writableFinished;
    guard(() => finishRequestResponse(scope, { status, aborted, endedAt: performance.now() }));
  };
  res.once("finish", () => complete(false));
  res.once("close", () => complete(true));
}

function classify(req: IncomingMessage, route: string, method: string): RequestKind {
  const action = headerValue(req, "next-action");
  if (action && action.length > 0) return "server_action";
  if (route === "/api" || route.startsWith("/api/")) return "route_handler";
  if (headerValue(req, "rsc") === "1") return "page";
  const accept = headerValue(req, "accept");
  if (accept?.includes("text/x-component")) return "page";
  if (method === "GET" || method === "HEAD") return "page";
  return "unknown";
}

function headerValue(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  return typeof value === "string" ? value : null;
}

function normalizeStatus(status: number): number {
  if (!Number.isInteger(status) || status < 100 || status > 599) return 0;
  return status;
}

function isIncoming(value: unknown): value is IncomingMessage {
  if (!value || typeof value !== "object") return false;
  const req = value as IncomingMessage;
  return typeof req.method === "string" && typeof req.url === "string" && !!req.headers && typeof req.headers === "object";
}

function isServerResponse(value: unknown): value is ServerResponse {
  if (!value || typeof value !== "object") return false;
  const res = value as ServerResponse;
  return typeof res.once === "function" && "statusCode" in res;
}
