import { BlockList } from "node:net";

/**
 * Client address used on audit rows.
 *
 * A forwarding header is accepted only after the TCP peer is identified as a
 * configured proxy. The default peers are loopback: Next.js listens on
 * 127.0.0.1 and nginx (`deploy/nginx.example.conf`) proxies to that address.
 * nginx sets `X-Forwarded-For` with `$proxy_add_x_forwarded_for`, appending the
 * address it observed. It does not set `X-Real-IP`, and that header is ignored.
 *
 * The forwarded list is read from the right. Trusted hops are skipped. The
 * first remaining address is the client. Any other peer keeps its own socket
 * address, and a missing or broken chain does not fall back to a client-supplied value.
 */
export const DEFAULT_TRUSTED_PROXIES = ["127.0.0.1", "::1"] as const;

const MAX_IP_LENGTH = 64;

export function trustedProxiesFromEnv(value: string | undefined = process.env.TRUSTED_PROXIES): readonly string[] {
  if (value === undefined) return DEFAULT_TRUSTED_PROXIES;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function isTrustedProxyAddress(address: string, trustedProxies: readonly string[]): boolean {
  const ip = normalizeIp(address);
  if (!ip) return false;
  return compileTrusted(trustedProxies).has(ip);
}

export function resolveClientIp(input: {
  remoteAddress?: string | null;
  forwardedFor?: string | null;
  trustedProxies?: readonly string[];
}): string | null {
  const remote = normalizeIp(input.remoteAddress);
  if (!remote) return null;

  const trusted = compileTrusted(input.trustedProxies ?? DEFAULT_TRUSTED_PROXIES);
  if (!trusted.has(remote)) return remote;

  const header = input.forwardedFor;
  if (header == null || header.trim() === "") return null;

  const tokens = header.split(",");
  let origin: string | null = null;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const hop = normalizeIp(tokens[index]);
    if (!hop) return null;
    if (!trusted.has(hop)) return hop;
    origin = hop;
  }
  return origin;
}

function compileTrusted(entries: readonly string[]): { has(ip: string): boolean } {
  const list = new BlockList();
  for (const entry of entries) addTrusted(list, entry);
  return {
    has(ip: string) {
      return list.check(ip, ip.includes(":") ? "ipv6" : "ipv4");
    },
  };
}

function addTrusted(list: BlockList, entry: string): void {
  const trimmed = entry.trim();
  if (!trimmed) return;
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    const ip = normalizeIp(trimmed);
    if (!ip) return;
    list.addAddress(ip, ip.includes(":") ? "ipv6" : "ipv4");
    return;
  }

  const ip = normalizeIp(trimmed.slice(0, slash));
  const prefixText = trimmed.slice(slash + 1).trim();
  if (!ip || !/^(0|[1-9]\d{0,2})$/.test(prefixText)) return;
  const prefix = Number(prefixText);
  const family = ip.includes(":") ? "ipv6" : "ipv4";
  const maxPrefix = family === "ipv6" ? 128 : 32;
  if (prefix > maxPrefix) return;
  list.addSubnet(ip, prefix, family);
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128 || /[\s,]/.test(trimmed)) return null;

  const stripped = stripPort(trimmed);
  if (!stripped || stripped.includes("%") || stripped.includes("/")) return null;

  const canonical = stripped.includes(":") ? canonicalIpv6(stripped) : canonicalIpv4(stripped);
  if (!canonical || canonical.length > MAX_IP_LENGTH) return null;
  return canonical;
}

function stripPort(value: string): string | null {
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end < 2) return null;
    const rest = value.slice(end + 1);
    if (rest !== "" && !validPortSuffix(rest)) return null;
    return value.slice(1, end);
  }

  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(value);
  if (!withPort) return value;
  if (!validPort(withPort[2])) return null;
  return withPort[1];
}

function validPortSuffix(rest: string): boolean {
  const match = /^:(\d{1,5})$/.exec(rest);
  return match !== null && validPort(match[1]);
}

function validPort(port: string): boolean {
  if (!/^(0|[1-9]\d{0,4})$/.test(port)) return false;
  return Number(port) <= 65535;
}

function canonicalIpv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    numbers.push(number);
  }
  return numbers.join(".");
}

function canonicalIpv6(value: string): string | null {
  let text = value.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) return null;

  const lastColon = text.lastIndexOf(":");
  const tail = lastColon >= 0 ? text.slice(lastColon + 1) : "";
  if (tail.includes(".")) {
    const ipv4 = canonicalIpv4(tail);
    if (!ipv4 || lastColon < 0) return null;
    const [a, b, c, d] = ipv4.split(".").map(Number);
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const sides = text.split("::");
  if (sides.length > 2) return null;
  const left = parseGroups(sides[0] ?? "");
  if (!left) return null;

  let groups: number[];
  if (sides.length === 2) {
    const right = parseGroups(sides[1] ?? "");
    if (!right) return null;
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array<number>(missing).fill(0), ...right];
  } else if (left.length === 8) {
    groups = left;
  } else {
    return null;
  }

  if (groups.length !== 8) return null;
  const mapped = mappedIpv4(groups);
  if (mapped) return mapped;
  return compressIpv6(groups);
}

function parseGroups(side: string): number[] | null {
  if (!side) return [];
  const groups = side.split(":");
  const numbers: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    numbers.push(Number.parseInt(group, 16));
  }
  return numbers;
}

function mappedIpv4(groups: readonly number[]): string | null {
  for (let index = 0; index < 5; index += 1) {
    if (groups[index] !== 0) return null;
  }
  if (groups[5] !== 0xffff) return null;
  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function compressIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = 0; index <= groups.length; index += 1) {
    if (index < groups.length && groups[index] === 0) {
      if (runStart < 0) runStart = index;
      continue;
    }
    if (runStart < 0) continue;
    const length = index - runStart;
    if (length > bestLength) {
      bestStart = runStart;
      bestLength = length;
    }
    runStart = -1;
  }

  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLength).join(":");
  return `${left}::${right}`;
}
