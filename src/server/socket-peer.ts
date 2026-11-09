import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Server } from "node:http";
import { isTrustedProxyAddress, trustedProxiesFromEnv } from "@/server/client-ip";

/** Stamped from the TCP peer. Clients can send the same name; only a signature from this process is accepted. */
export const SOCKET_IP_HEADER = "x-mms-socket-ip";

const CAPTURE_STATE = Symbol.for("mms.socket-peer-capture");
const SEPARATOR = "~";

type CaptureState = { secret: Buffer };
type HeaderValue = string | string[] | undefined;
type PeerRequest = {
  headers: Record<string, HeaderValue>;
  socket?: { remoteAddress?: string | null } | null;
};

function captureState(): CaptureState | null {
  const value = (globalThis as Record<symbol, CaptureState | undefined>)[CAPTURE_STATE];
  if (!value?.secret) return null;
  return value;
}

export function isSocketPeerCaptureInstalled(): boolean {
  return captureState() !== null;
}

/**
 * Records `socket.remoteAddress` on the Node request before Next.js copies headers.
 * Next.js keeps a client-supplied `X-Forwarded-For` and does not expose the socket
 * beside it. A signature distinguishes this stamp from a header the caller sent.
 * An already valid stamp is kept when the peer is a trusted proxy so an internal
 * server-action forward does not replace the original peer with loopback.
 */
export function installSocketPeerCapture(): void {
  if (captureState()) return;
  const globalState = globalThis as Record<symbol, CaptureState | undefined>;
  globalState[CAPTURE_STATE] = { secret: randomBytes(32) };
  try {
    patchServerEmit();
  } catch (error) {
    delete globalState[CAPTURE_STATE];
    throw error;
  }
}

export function stampSocketPeer(req: PeerRequest): void {
  const peer = req.socket?.remoteAddress;
  if (typeof peer !== "string" || peer.length === 0 || peer.includes(SEPARATOR)) {
    delete req.headers[SOCKET_IP_HEADER];
    return;
  }

  const current = headerString(req.headers[SOCKET_IP_HEADER]);
  const preserved = verifiedSocketAddress(current);
  if (preserved && isTrustedProxyAddress(peer, trustedProxiesFromEnv())) return;

  const signed = signSocketAddress(peer);
  if (!signed) {
    delete req.headers[SOCKET_IP_HEADER];
    return;
  }
  req.headers[SOCKET_IP_HEADER] = signed;
}

export function verifiedSocketAddress(header: string | null | undefined): string | null {
  const state = captureState();
  if (!state || typeof header !== "string" || header.length === 0 || header.length > 256) return null;
  const cut = header.lastIndexOf(SEPARATOR);
  if (cut <= 0 || cut !== header.indexOf(SEPARATOR)) return null;
  const remote = header.slice(0, cut);
  const mac = header.slice(cut + 1);
  if (!remote || remote.includes(SEPARATOR) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;

  const expected = digest(state.secret, remote);
  const actual = Buffer.from(mac);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) return null;
  return remote;
}

function signSocketAddress(remote: string): string | null {
  const state = captureState();
  if (!state || remote.includes(SEPARATOR) || remote.length > 128) return null;
  return `${remote}${SEPARATOR}${digest(state.secret, remote)}`;
}

function digest(secret: Buffer, remote: string): string {
  return createHmac("sha256", secret).update(remote).digest("base64url");
}

function headerString(value: HeaderValue): string | null {
  return typeof value === "string" ? value : null;
}

function patchServerEmit(): void {
  const proto = Server.prototype as Server & {
    emit: (event: string | symbol, ...args: unknown[]) => boolean;
  };
  const original = proto.emit;
  proto.emit = function emitWithSocketPeer(this: Server, event: string | symbol, ...args: unknown[]): boolean {
    if ((event === "request" || event === "upgrade") && isPeerRequest(args[0])) {
      stampSocketPeer(args[0]);
    }
    return original.call(this, event, ...args);
  };
}

function isPeerRequest(value: unknown): value is PeerRequest {
  if (!value || typeof value !== "object") return false;
  const headers = (value as { headers?: unknown }).headers;
  return headers !== null && typeof headers === "object";
}
