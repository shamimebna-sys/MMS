import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "mms_session";
export const SLIDING_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export type SessionClaims = {
  sid: string;
  sub: number;
  abs: number;
  exp: number;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

function issuer(): string {
  return process.env.AUTH_ISSUER || "mms";
}

function audience(): string {
  return process.env.AUTH_AUDIENCE || "mms-web";
}

export async function signSessionToken(input: { sid: string; userId: number; absoluteExpiresAt: Date }): Promise<string> {
  const abs = Math.floor(input.absoluteExpiresAt.getTime() / 1000);
  const exp = Math.min(Math.floor((Date.now() + SLIDING_MS) / 1000), abs);
  return new SignJWT({ sid: input.sid, abs })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(input.userId))
    .setIssuer(issuer())
    .setAudience(audience())
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: issuer(),
      audience: audience(),
      algorithms: ["HS256"],
    });
    const sid = payload.sid;
    const abs = payload.abs;
    const sub = Number(payload.sub);
    if (typeof sid !== "string" || typeof abs !== "number" || !Number.isInteger(sub)) return null;
    if (payload.exp == null) return null;
    return { sid, sub, abs, exp: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
