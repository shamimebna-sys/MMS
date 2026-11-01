import { z } from "zod";

const optionalId = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  });

export const paymentSchema = z.object({
  title: z.string().trim().min(1).max(250),
  type: z.enum(["DR", "CR"]),
  amount: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter a decimal amount."),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
  candidateId: optionalId,
  agentId: optionalId,
  currencyId: optionalId,
  paymentMethod: z.enum(["CASH", "SELF", "CHEQUE", "ONLINE", ""]).optional().transform((value) => (value ? value : null)),
  remarks: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value ? value : null)),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
