import { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAudit } from "@/server/audit";
import { normalizeIp, resolveClientIp } from "@/server/client-ip";
import { requestIp } from "@/server/current-user";
import { SOCKET_IP_HEADER, installSocketPeerCapture, stampSocketPeer, verifiedSocketAddress } from "@/server/socket-peer";

const mocks = vi.hoisted(() => ({
  headerGet: vi.fn<(name: string) => string | null>(() => null),
  auditCreate: vi.fn(async () => ({})),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: mocks.headerGet }),
  cookies: async () => ({ get: () => undefined }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: { create: mocks.auditCreate },
  },
}));

const originalTrusted = process.env.TRUSTED_PROXIES;
const loopback = ["127.0.0.1", "::1"];

beforeAll(() => {
  installSocketPeerCapture();
});

beforeEach(() => {
  delete process.env.TRUSTED_PROXIES;
  mocks.headerGet.mockReset();
  mocks.auditCreate.mockClear();
});

afterAll(() => {
  if (originalTrusted === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = originalTrusted;
});

describe("client IP trust", () => {
  it("ignores a forged X-Forwarded-For value from an untrusted sender", () => {
    expect(
      resolveClientIp({
        remoteAddress: "198.51.100.20",
        forwardedFor: "1.2.3.4",
        trustedProxies: loopback,
      }),
    ).toBe("198.51.100.20");
    expect(
      resolveClientIp({
        remoteAddress: "2001:db8::5",
        forwardedFor: "8.8.8.8, 203.0.113.9",
        trustedProxies: loopback,
      }),
    ).toBe("2001:db8::5");
  });

  it("uses the socket address when no forwarding header is present", () => {
    expect(resolveClientIp({ remoteAddress: "203.0.113.9", forwardedFor: null, trustedProxies: loopback })).toBe("203.0.113.9");
    expect(resolveClientIp({ remoteAddress: "::ffff:198.51.100.8", forwardedFor: undefined, trustedProxies: loopback })).toBe("198.51.100.8");
  });

  it("resolves the client through a trusted proxy chain and ignores the forged prefix", () => {
    expect(
      resolveClientIp({
        remoteAddress: "127.0.0.1",
        forwardedFor: "8.8.8.8, 203.0.113.10, 10.0.0.8",
        trustedProxies: ["127.0.0.1", "::1", "10.0.0.8"],
      }),
    ).toBe("203.0.113.10");
    expect(
      resolveClientIp({
        remoteAddress: "::1",
        forwardedFor: "2001:db8::ffff, 2001:db8::10, 2001:db8:1::1",
        trustedProxies: ["::1", "2001:db8:1::1"],
      }),
    ).toBe("2001:db8::10");
  });

  it("accepts a configured proxy subnet and stops at the first untrusted hop", () => {
    const trusted = ["127.0.0.1", "10.0.0.0/8", "2001:db8::/32"];
    expect(
      resolveClientIp({
        remoteAddress: "127.0.0.1",
        forwardedFor: "203.0.113.8, 10.255.255.255",
        trustedProxies: trusted,
      }),
    ).toBe("203.0.113.8");
    expect(
      resolveClientIp({
        remoteAddress: "::1",
        forwardedFor: "2001:db9::5, 2001:db8::1",
        trustedProxies: ["::1", "2001:db8::/32"],
      }),
    ).toBe("2001:db9::5");
    expect(
      resolveClientIp({
        remoteAddress: "127.0.0.1",
        forwardedFor: "203.0.113.8, 11.0.0.1",
        trustedProxies: trusted,
      }),
    ).toBe("11.0.0.1");
  });

  it("canonicalizes IPv4 and IPv6, including mapped and bracketed forms", () => {
    expect(normalizeIp("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("203.0.113.9:443")).toBe("203.0.113.9");
    expect(normalizeIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
    expect(normalizeIp("[2001:db8::2]:443")).toBe("2001:db8::2");
    expect(normalizeIp("::1")).toBe("::1");
    expect(
      resolveClientIp({
        remoteAddress: "::ffff:127.0.0.1",
        forwardedFor: "1.1.1.1, 2001:0DB8::10",
        trustedProxies: loopback,
      }),
    ).toBe("2001:db8::10");
  });

  it("returns null for a missing, malformed, or broken forwarded chain from a trusted proxy", () => {
    const trusted = { remoteAddress: "127.0.0.1", trustedProxies: loopback };
    expect(resolveClientIp({ ...trusted, forwardedFor: null })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "   " })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "not-an-ip" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "999.1.1.1" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "01.2.3.4" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "1.2.3" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "localhost" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "::gggg" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "1::2::3" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "fe80::1%eth0" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "203.0.113.10, not-an-ip" })).toBeNull();
    expect(resolveClientIp({ ...trusted, forwardedFor: "not-an-ip, 203.0.113.10" })).toBe("203.0.113.10");
    expect(resolveClientIp({ remoteAddress: null, forwardedFor: "203.0.113.10", trustedProxies: loopback })).toBeNull();
    expect(resolveClientIp({ remoteAddress: "01.2.3.4", forwardedFor: "203.0.113.10", trustedProxies: loopback })).toBeNull();
  });

  it("does not trust loopback when the proxy list is empty", () => {
    expect(
      resolveClientIp({
        remoteAddress: "127.0.0.1",
        forwardedFor: "203.0.113.5",
        trustedProxies: [],
      }),
    ).toBe("127.0.0.1");
  });
});

describe("socket peer capture", () => {
  it("replaces a client-supplied socket header with the connection address", () => {
    const headers: Record<string, string> = {
      [SOCKET_IP_HEADER]: "1.2.3.4",
      "x-forwarded-for": "8.8.8.8",
      "x-real-ip": "9.9.9.9",
    };
    stampSocketPeer({ headers, socket: { remoteAddress: "198.51.100.14" } });
    expect(verifiedSocketAddress(headers[SOCKET_IP_HEADER])).toBe("198.51.100.14");
    expect(headers["x-real-ip"]).toBe("9.9.9.9");
  });

  it("rejects an unsigned socket header", () => {
    expect(verifiedSocketAddress("198.51.100.14")).toBeNull();
    expect(verifiedSocketAddress("198.51.100.14~not-a-signature")).toBeNull();
    expect(verifiedSocketAddress(null)).toBeNull();
  });

  it("keeps a signed peer across a trusted forward and drops it from an untrusted sender", () => {
    const original: Record<string, string> = {};
    stampSocketPeer({ headers: original, socket: { remoteAddress: "198.51.100.14" } });
    const signed = original[SOCKET_IP_HEADER];

    const forwarded: Record<string, string> = { [SOCKET_IP_HEADER]: signed ?? "" };
    stampSocketPeer({ headers: forwarded, socket: { remoteAddress: "127.0.0.1" } });
    expect(forwarded[SOCKET_IP_HEADER]).toBe(signed);

    const direct: Record<string, string> = { [SOCKET_IP_HEADER]: signed ?? "" };
    stampSocketPeer({ headers: direct, socket: { remoteAddress: "203.0.113.4" } });
    expect(verifiedSocketAddress(direct[SOCKET_IP_HEADER])).toBe("203.0.113.4");
  });

  it("stamps the socket on the HTTP request before listeners run", () => {
    const emit = Server.prototype.emit;
    installSocketPeerCapture();
    expect(Server.prototype.emit).toBe(emit);

    const server = new Server();
    const req = {
      headers: { [SOCKET_IP_HEADER]: "8.8.8.8", "x-forwarded-for": "1.2.3.4" },
      socket: { remoteAddress: "198.51.100.40" },
    };
    let seen = "";
    server.on("request", (incoming: typeof req) => {
      seen = incoming.headers[SOCKET_IP_HEADER] ?? "";
    });
    server.emit("request", req as never, {} as never);
    expect(verifiedSocketAddress(seen)).toBe("198.51.100.40");
  });

  it("removes the socket header when the connection has no address", () => {
    const headers: Record<string, string> = { [SOCKET_IP_HEADER]: "1.2.3.4" };
    stampSocketPeer({ headers, socket: { remoteAddress: "" } });
    expect(headers[SOCKET_IP_HEADER]).toBeUndefined();

    const missing: Record<string, string> = { [SOCKET_IP_HEADER]: "1.2.3.4" };
    stampSocketPeer({ headers: missing, socket: null });
    expect(missing[SOCKET_IP_HEADER]).toBeUndefined();
  });
});

describe("requestIp", () => {
  it("does not let a forged forwarding header override an untrusted connection", async () => {
    const headers = peerHeaders("198.51.100.20", {
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "8.8.8.8",
    });
    const reads: string[] = [];
    mocks.headerGet.mockImplementation((name: string) => {
      reads.push(name);
      return headers[name] ?? null;
    });

    await expect(requestIp()).resolves.toBe("198.51.100.20");
    expect(reads).toEqual([SOCKET_IP_HEADER, "x-forwarded-for"]);
  });

  it("reads the client from the trusted proxy chain, not the first forwarded value", async () => {
    const headers = peerHeaders("127.0.0.1", {
      "x-forwarded-for": "1.2.3.4, 203.0.113.50",
      "x-real-ip": "8.8.8.8",
    });
    mocks.headerGet.mockImplementation((name: string) => headers[name] ?? null);
    await expect(requestIp()).resolves.toBe("203.0.113.50");
  });

  it("honors TRUSTED_PROXIES and returns null when the signed peer is missing", async () => {
    process.env.TRUSTED_PROXIES = "10.0.0.8";
    const headers = peerHeaders("10.0.0.8", { "x-forwarded-for": "8.8.8.8, 203.0.113.70" });
    mocks.headerGet.mockImplementation((name: string) => headers[name] ?? null);
    await expect(requestIp()).resolves.toBe("203.0.113.70");

    mocks.headerGet.mockImplementation((name: string) => (name === "x-forwarded-for" ? "203.0.113.70" : "203.0.113.70~forged"));
    await expect(requestIp()).resolves.toBeNull();
  });

  it("returns null for a trusted peer with a missing or malformed forwarded header", async () => {
    const missing = peerHeaders("::1", {});
    mocks.headerGet.mockImplementation((name: string) => missing[name] ?? null);
    await expect(requestIp()).resolves.toBeNull();

    const malformed = peerHeaders("::ffff:127.0.0.1", { "x-forwarded-for": "203.0.113.1, nope" });
    mocks.headerGet.mockImplementation((name: string) => malformed[name] ?? null);
    await expect(requestIp()).resolves.toBeNull();
  });

  it("supports an IPv6 client behind the trusted proxy", async () => {
    const headers = peerHeaders("::1", { "x-forwarded-for": "2001:0db8:0000::0001" });
    mocks.headerGet.mockImplementation((name: string) => headers[name] ?? null);
    await expect(requestIp()).resolves.toBe("2001:db8::1");
  });
});

describe("audit logging", () => {
  it("stores the supplied address and the same audit fields", async () => {
    await writeAudit({
      userId: 4,
      action: "login",
      entityType: "sessions",
      entityId: "sid-1",
      metadata: { next: "/dashboard" },
      ip: "2001:db8::1",
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 4,
        action: "login",
        entityType: "sessions",
        entityId: "sid-1",
        metadata: { next: "/dashboard" },
        ip: "2001:db8::1",
      },
    });
  });

  it("still records a null address when the caller omits one", async () => {
    await writeAudit({ userId: null, action: "logout", entityType: "sessions" });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: {
        userId: null,
        action: "logout",
        entityType: "sessions",
        entityId: null,
        metadata: undefined,
        ip: null,
      },
    });
  });
});

function peerHeaders(remoteAddress: string, incoming: Record<string, string>): Record<string, string> {
  const headers = { ...incoming };
  stampSocketPeer({ headers, socket: { remoteAddress } });
  return headers;
}
