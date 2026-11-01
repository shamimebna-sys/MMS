import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { verifySessionToken } from "@/lib/auth/jwt";
import type { AccessUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

export async function getCurrentUser(): Promise<AccessUser | null> {
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
  };
}

export async function requireUser(): Promise<AccessUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requestIp(): Promise<string | null> {
  const forwarded = (await headers()).get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}
