"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requestIp, requireUser } from "@/server/current-user";
import { storeUpload } from "@/server/uploads";
import { writeAudit } from "@/server/audit";
import { newInvoiceNo } from "@/server/wallet";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveWalletPayment(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.agentId == null && user.subAgentId == null) redirect("/wallet?error=You cannot add a wallet payment.");
  const amount = text(formData, "amount");
  if (!/^\d+(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0) redirect("/wallet?error=Enter an amount greater than zero.");
  const currencyId = Number(text(formData, "currency_id"));
  if (![1, 2].includes(currencyId)) redirect("/wallet?error=Choose a currency.");
  const paymentMethod = text(formData, "payment_method");
  if (!["ONLINE", "CHEQUE", "CASH"].includes(paymentMethod)) redirect("/wallet?error=Choose a payment method.");
  const invoiceNo = text(formData, "invoice_no") || newInvoiceNo();
  const paymentDate = text(formData, "payment_date");
  const paymentTime = text(formData, "payment_time");
  const file = formData.get("cheque_file_path");
  let chequeFilePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const stored = await storeUpload({
      bytes: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      ownerTable: "payments",
      createdBy: user.id,
    });
    chequeFilePath = `/api/files/${stored.id}`;
  }
  const rate =
    currencyId === 1
      ? await prisma.payment.findFirst({
          where: { currencyId: 1, exchangeRate: { gt: 1 } },
          orderBy: { id: "desc" },
          select: { exchangeRate: true },
        })
      : null;
  const created = await prisma.payment.create({
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
      bankName: text(formData, "bank_name") || null,
      accNo: text(formData, "acc_no") || null,
      trxNo: text(formData, "trx_no") || null,
      status: "P",
      userId: user.id,
      chequeFilePath,
      accountName: text(formData, "account_name") || null,
      currencyId,
      exchangeRate: rate?.exchangeRate ?? "1",
      paymentMethod,
      paymentReceiver: text(formData, "payment_receiver") || null,
      paymentReceivedLocation: text(formData, "payment_received_location") || null,
      paymentTime: paymentTime || null,
      description: text(formData, "description") || null,
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
    metadata: { source: "wallet", amount, paymentMethod },
    ip: await requestIp(),
  });
  redirect("/wallet?saved=1");
}
