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

export const partySchema = z.object({
  name: z.string().trim().min(1).max(100),
  agentId: optionalId,
  code: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value ? value : null)),
  mobile: z
    .string()
    .trim()
    .max(250)
    .optional()
    .transform((value) => (value ? value : null)),
  email: z
    .string()
    .trim()
    .max(250)
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value == null || z.string().email().safeParse(value).success, "Enter a valid email."),
});

export type PartyInput = z.infer<typeof partySchema>;
