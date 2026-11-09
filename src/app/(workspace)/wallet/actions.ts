"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requestIp, requireUser } from "@/server/current-user";
import { writeAudit } from "@/server/audit";
import { isPositiveAmount } from "@/lib/money";
import {
  acceptedIdempotencyKey,
  decideSubmission,
  isUniqueViolation,
  newIdempotencyKey,
  sha256Hex,
  walletFingerprint,
  type WalletSubmission,
} from "@/lib/payment-idempotency";
import { sha256OfPaymentFile } from "@/server/payment-idempotency";
import { canAddWalletPayment, withWalletCheque } from "@/server/wallet-upload";
import { newInvoiceNo } from "@/server/wallet";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const walletReplaySelect = {
  id: true,
  userId: true,
  createdBy: true,
  title: true,
  type: true,
  candidateId: true,
  teacherId: true,
  employeeId: true,
  employerId: true,
  agentId: true,
  subAgentId: true,
  amount: true,
  currencyId: true,
  paymentMethod: true,
  invoiceNo: true,
  paymentDate: true,
  paymentTime: true,
  bankName: true,
  accNo: true,
  trxNo: true,
  accountName: true,
  paymentReceiver: true,
  paymentReceivedLocation: true,
  description: true,
  chequeFilePath: true,
} as const;

function walletDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

async function walletFromRow(row: {
  userId: number | null;
  createdBy: number | null;
  title: string | null;
  type: string | null;
  candidateId: number | null;
  teacherId: number | null;
  employeeId: number | null;
  employerId: number | null;
  agentId: number | null;
  subAgentId: number | null;
  amount: { toString(): string } | string | null;
  currencyId: number | null;
  paymentMethod: string | null;
  invoiceNo: string | null;
  paymentDate: Date | null;
  paymentTime: string | null;
  bankName: string | null;
  accNo: string | null;
  trxNo: string | null;
  accountName: string | null;
  paymentReceiver: string | null;
  paymentReceivedLocation: string | null;
  description: string | null;
  chequeFilePath: string | null;
}): Promise<WalletSubmission> {
  return {
    userId: row.userId ?? row.createdBy ?? 0,
    title: row.title ?? "",
    type: row.type ?? "",
    candidateId: row.candidateId,
    teacherId: row.teacherId,
    employeeId: row.employeeId,
    employerId: row.employerId,
    agentId: row.agentId,
    subAgentId: row.subAgentId,
    amount: row.amount == null ? "" : String(row.amount),
    currencyId: row.currencyId ?? 0,
    paymentMethod: row.paymentMethod ?? "",
    invoiceNo: row.invoiceNo ?? "",
    paymentDate: walletDate(row.paymentDate),
    paymentTime: row.paymentTime,
    bankName: row.bankName,
    accNo: row.accNo,
    trxNo: row.trxNo,
    accountName: row.accountName,
    paymentReceiver: row.paymentReceiver,
    paymentReceivedLocation: row.paymentReceivedLocation,
    description: row.description,
    chequeSha256: row.chequeFilePath ? await sha256OfPaymentFile(row.chequeFilePath) : "",
  };
}

export async function saveWalletPayment(formData: FormData): Promise<void> {
  const user = await requireUser();
  const suppliedKey = acceptedIdempotencyKey(text(formData, "idempotency_key"));
  if (!canAddWalletPayment(user)) redirect(walletError("You cannot add a wallet payment.", suppliedKey));
  const key = suppliedKey ?? newIdempotencyKey();
  const amount = text(formData, "amount");
  if (!isPositiveAmount(amount)) redirect(walletError("Enter an amount greater than zero.", suppliedKey));
  const currencyId = Number(text(formData, "currency_id"));
  if (![1, 2].includes(currencyId)) redirect(walletError("Choose a currency.", suppliedKey));
  const paymentMethod = text(formData, "payment_method");
  if (!["ONLINE", "CHEQUE", "CASH"].includes(paymentMethod)) redirect(walletError("Choose a payment method.", suppliedKey));
  const invoiceNo = text(formData, "invoice_no") || newInvoiceNo();
  const paymentDate = text(formData, "payment_date");
  const paymentTime = text(formData, "payment_time");
  const file = formData.get("cheque_file_path");
  const upload = file instanceof File && file.size > 0 ? file : null;
  const chequeSha256 = upload ? sha256Hex(new Uint8Array(await upload.arrayBuffer())) : "";
  const submission: WalletSubmission = {
    userId: user.id,
    title: "New Payment request.",
    type: "CR",
    candidateId: 0,
    teacherId: 0,
    employeeId: 0,
    employerId: 0,
    agentId: user.agentId,
    subAgentId: user.subAgentId ?? 0,
    amount,
    currencyId,
    paymentMethod,
    invoiceNo,
    paymentDate,
    paymentTime: paymentTime || null,
    bankName: text(formData, "bank_name") || null,
    accNo: text(formData, "acc_no") || null,
    trxNo: text(formData, "trx_no") || null,
    accountName: text(formData, "account_name") || null,
    paymentReceiver: text(formData, "payment_receiver") || null,
    paymentReceivedLocation: text(formData, "payment_received_location") || null,
    description: text(formData, "description") || null,
    chequeSha256,
  };
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key }, select: walletReplaySelect });
  if (existing) {
    if (!(await sameWalletSubmission(existing, submission, user.id))) redirect(walletConflict(suppliedKey));
    redirect("/wallet?saved=1");
  }
  const rate =
    currencyId === 1
      ? await prisma.payment.findFirst({
          where: { currencyId: 1, exchangeRate: { gt: 1 } },
          orderBy: { id: "desc" },
          select: { exchangeRate: true },
        })
      : null;
  let created: { id: number };
  try {
    created = await withWalletCheque(user, upload, (chequeFilePath) =>
      prisma.payment.create({
        data: {
          title: "New Payment request.",
          type: "CR",
          agentId: user.agentId,
          subAgentId: user.subAgentId ?? 0,
          candidateId: 0,
          teacherId: 0,
          employeeId: 0,
          employerId: 0,
          amount,
          paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00.000Z`) : new Date(),
          invoiceNo,
          bankName: submission.bankName,
          accNo: submission.accNo,
          trxNo: submission.trxNo,
          status: "P",
          userId: user.id,
          chequeFilePath,
          accountName: submission.accountName,
          currencyId,
          exchangeRate: rate?.exchangeRate ?? "1",
          paymentMethod,
          paymentReceiver: submission.paymentReceiver,
          paymentReceivedLocation: submission.paymentReceivedLocation,
          paymentTime: paymentTime || null,
          description: submission.description,
          idempotencyKey: key,
          createdBy: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true },
      }),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await prisma.payment.findUnique({ where: { idempotencyKey: key }, select: walletReplaySelect });
    if (!winner || !(await sameWalletSubmission(winner, submission, user.id))) redirect(walletConflict(suppliedKey));
    redirect("/wallet?saved=1");
  }
  await writeAudit({
    userId: user.id,
    action: "create",
    entityType: "payments",
    entityId: String(created.id),
    metadata: { source: "wallet", amount, paymentMethod },
    ip: await requestIp(),
  });
  redirect("/wallet?saved=1");
}

async function sameWalletSubmission(
  row: Parameters<typeof walletFromRow>[0],
  submission: WalletSubmission,
  userId: number,
): Promise<boolean> {
  if (row.createdBy !== userId && row.userId !== userId) return false;
  const stored = await walletFromRow(row);
  const incoming = walletFingerprint({ ...submission, paymentDate: submission.paymentDate || stored.paymentDate });
  return decideSubmission({ fingerprint: walletFingerprint(stored) }, incoming) === "replay";
}

function walletError(message: string, key: string | null): string {
  if (!key) return `/wallet?error=${message}`;
  return `/wallet?error=${encodeURIComponent(message)}&create=1&idempotency_key=${key}`;
}

function walletConflict(key: string | null): string {
  return walletError("This submission key was already used for a different payment.", key);
}
