import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { verifySessionToken } from "@/lib/auth/jwt";
import type { AccessUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { resolveClientIp, trustedProxiesFromEnv } from "@/server/client-ip";
import { SOCKET_IP_HEADER, verifiedSocketAddress } from "@/server/socket-peer";

// Request-scoped. Outside a React request this calls through, so sessions are never reused across requests.
export const getCurrentUser = cache(loadCurrentUser);

async function loadCurrentUser(): Promise<AccessUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  if (claims.abs * 1000 <= Date.now()) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: {
      user: {
        include: {
          roleIdRef: {
            include: {
              permissionRoleLinks0: { include: { permissionIdRef: true } },
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.userId !== claims.sub) return null;
  if (session.absoluteExpiresAt.getTime() <= Date.now()) return null;
  const status = session.user.status?.trim() || null;
  if (status && status !== "A") return null;

  return {
    id: session.user.id,
    name: session.user.name,
    roleName: session.user.roleIdRef?.name ?? null,
    permissions: session.user.roleIdRef?.permissionRoleLinks0.map((link) => link.permissionIdRef.key) ?? [],
    agentId: session.user.agentId,
    subAgentId: session.user.subAgentId,
    candidateId: session.user.candidateId,
    agencierId: session.user.agencierId,
    companierId: session.user.companierId,
    status,
    email: session.user.email,
    avatar: session.user.avatar,
    roleDisplayName: session.user.roleIdRef?.displayName ?? null,
  };
}

export function sessionEmail(user: AccessUser): string {
  return user.email?.trim() || "";
}

export function sessionAvatar(user: AccessUser): string {
  return user.avatar?.trim() || "";
}

/** Shell and dashboard label. Role checks stay on roleName. */
export function sessionRoleLabel(user: AccessUser): string {
  return user.roleDisplayName?.trim() || user.roleName?.trim() || "";
}

export async function requireUser(): Promise<AccessUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requestIp(): Promise<string | null> {
  const headerList = await headers();
  return resolveClientIp({
    remoteAddress: verifiedSocketAddress(headerList.get(SOCKET_IP_HEADER)),
    forwardedFor: headerList.get("x-forwarded-for"),
    trustedProxies: trustedProxiesFromEnv(),
  });
}
