import { candidateSchema, type CandidateInput } from "@/features/candidates/schema";
import { partySchema, type PartyInput } from "@/features/parties/schema";
import { paymentSchema, type PaymentInput } from "@/features/payments/schema";
import { canMutateTable, recordScope, type AccessUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/audit";
import { getResource, readRecord, type ResourceDef } from "@/server/resources";

function canCreateParty(user: AccessUser, table: string): boolean {
  const scope = recordScope(user);
  if (scope.kind === "all") return true;
  return table === "sub_agents" && scope.kind === "agent";
}

export async function createCandidateRecord(user: AccessUser, input: CandidateInput, ip: string | null) {
  if (!canMutateTable(user, "candidates", "add")) throw new Error("You cannot add candidates.");
  const parsed = candidateSchema.parse(input);
  const scope = recordScope(user);
  let agentId = parsed.agentId;
  let subAgentId: number | null = null;
  let agencierId: number | null = null;
  let companierId: number | null = null;
  if (scope.kind === "agent") agentId = scope.agentId;
  if (scope.kind === "subAgent") subAgentId = scope.subAgentId;
  if (scope.kind === "agencier") agencierId = scope.agencierId;
  if (scope.kind === "companier") companierId = scope.companierId;
  if (scope.kind === "candidate" || scope.kind === "none") throw new Error("You cannot add candidates.");
  const created = await prisma.candidate.create({
    data: {
      name: parsed.name,
      code: parsed.code,
      mobile: parsed.mobile,
      email: parsed.email,
      passportNo: parsed.passportNo,
      gender: parsed.gender,
      agentId,
      subAgentId,
      agencierId,
      companierId,
      position: parsed.position,
      status: parsed.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  await writeAudit({ userId: user.id, action: "create", entityType: "candidates", entityId: String(created.id), ip });
  return created.id;
}

export async function updateCandidateRecord(
  user: AccessUser,
  id: number,
  input: Pick<CandidateInput, "name" | "mobile" | "status" | "position">,
  ip: string | null,
) {
  if (!canMutateTable(user, "candidates", "edit")) throw new Error("You cannot edit candidates.");
  const resource = getResource("candidates");
  if (!resource) throw new Error("Unknown module.");
  const existing = await readRecord(resource, user, id);
  if (!existing) throw new Error("Candidate not found.");
  const parsed = candidateSchema.pick({ name: true, mobile: true, status: true, position: true }).parse(input);
  await prisma.candidate.update({
    where: { id },
    data: {
      name: parsed.name,
      mobile: parsed.mobile,
      status: parsed.status,
      position: parsed.position,
      updatedAt: new Date(),
    },
  });
  await writeAudit({ userId: user.id, action: "update", entityType: "candidates", entityId: String(id), ip });
}

export async function createPaymentRecord(user: AccessUser, input: PaymentInput, ip: string | null) {
  if (!canMutateTable(user, "payments", "add")) throw new Error("You cannot add payments.");
  const parsed = paymentSchema.parse(input);
  const scope = recordScope(user);
  let agentId = parsed.agentId;
  let candidateId = parsed.candidateId;
  if (scope.kind === "agent") agentId = scope.agentId;
  if (scope.kind === "candidate") candidateId = scope.candidateId;
  if (scope.kind === "none") throw new Error("You cannot add payments.");
  if (candidateId) {
    const candidates = getResource("candidates");
    if (!candidates) throw new Error("Unknown module.");
    const visible = await readRecord(candidates, user, candidateId);
    if (!visible) throw new Error("That candidate is outside your access.");
  }
  const created = await prisma.payment.create({
    data: {
      title: parsed.title,
      type: parsed.type,
      amount: parsed.amount,
      paymentDate: new Date(`${parsed.paymentDate}T00:00:00.000Z`),
      candidateId,
      agentId,
      currencyId: parsed.currencyId,
      paymentMethod: parsed.paymentMethod,
      remarks: parsed.remarks,
      status: "A",
      createdBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    select: { id: true },
  });
  await writeAudit({
    userId: user.id,
    action: "create",
    entityType: "payments",
    entityId: String(created.id),
    metadata: { amount: parsed.amount, type: parsed.type },
    ip,
  });
  return created.id;
}

export async function createPartyRecord(user: AccessUser, resource: ResourceDef, input: PartyInput, ip: string | null) {
  if (!resource.create || resource.create !== "party") throw new Error("This module cannot be created here.");
  if (!canMutateTable(user, resource.table, "add")) throw new Error("You cannot add this record.");
  if (!canCreateParty(user, resource.table)) throw new Error("You cannot add this record.");
  const parsed = partySchema.parse(input);
  const now = new Date();
  let id = 0;
  if (resource.table === "agents") {
    const created = await prisma.agent.create({
      data: { name: parsed.name, code: parsed.code, mobile: parsed.mobile, email: parsed.email, status: "A", createdAt: now, updatedAt: now },
      select: { id: true },
    });
    id = created.id;
  } else if (resource.table === "sub_agents") {
    const scope = recordScope(user);
    const agentId = scope.kind === "agent" ? scope.agentId : parsed.agentId;
    if (!agentId) throw new Error("A sub-agent must belong to an agent.");
    const created = await prisma.subAgent.create({
      data: { name: parsed.name, code: parsed.code, mobile: parsed.mobile, email: parsed.email, agentId, status: "A", createdAt: now, updatedAt: now },
      select: { id: true },
    });
    id = created.id;
  } else if (resource.table === "agenciers") {
    const created = await prisma.agencier.create({
      data: { name: parsed.name, code: parsed.code, mobile: parsed.mobile, email: parsed.email, status: "A", createdAt: now, updatedAt: now },
      select: { id: true },
    });
    id = created.id;
  } else if (resource.table === "companiers") {
    const created = await prisma.companier.create({
      data: { name: parsed.name, code: parsed.code, mobile: parsed.mobile, email: parsed.email, status: "A", createdAt: now, updatedAt: now },
      select: { id: true },
    });
    id = created.id;
  } else {
    throw new Error("Unsupported module.");
  }
  await writeAudit({ userId: user.id, action: "create", entityType: resource.table, entityId: String(id), ip });
  return id;
}

export async function softDeleteRecord(user: AccessUser, resource: ResourceDef, id: number, ip: string | null) {
  if (!resource.softDelete) throw new Error("This record cannot be archived.");
  if (!canMutateTable(user, resource.table, "delete")) throw new Error("You cannot archive this record.");
  const existing = await readRecord(resource, user, id);
  if (!existing) throw new Error("Record not found.");
  const now = new Date();
  if (resource.table === "candidates") await prisma.candidate.update({ where: { id }, data: { deletedAt: now, updatedAt: now } });
  else if (resource.table === "agents") await prisma.agent.update({ where: { id }, data: { deletedAt: now, updatedAt: now } });
  else if (resource.table === "sub_agents") await prisma.subAgent.update({ where: { id }, data: { deletedAt: now, updatedAt: now } });
  else if (resource.table === "agenciers") await prisma.agencier.update({ where: { id }, data: { deletedAt: now, updatedAt: now } });
  else if (resource.table === "companiers") await prisma.companier.update({ where: { id }, data: { deletedAt: now, updatedAt: now } });
  else throw new Error("Unsupported module.");
  await writeAudit({ userId: user.id, action: "archive", entityType: resource.table, entityId: String(id), ip });
}
