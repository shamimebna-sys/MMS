import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const optionalId = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  });

export const candidateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: optionalText(100),
  mobile: optionalText(250),
  email: z
    .string()
    .trim()
    .max(250)
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value == null || z.string().email().safeParse(value).success, "Enter a valid email."),
  passportNo: optionalText(250),
  gender: z.enum(["Male", "Female", "Other", ""]).optional().transform((value) => (value ? value : null)),
  agentId: optionalId,
  position: optionalText(250),
  status: z
    .string()
    .trim()
    .max(5)
    .optional()
    .transform((value) => (value ? value : "A")),
});

export type CandidateInput = z.infer<typeof candidateSchema>;
