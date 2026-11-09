import { z } from "zod";

/**
 * Columns a candidate may write on their own candidate row.
 * Name and email also update the signed-in account. Staff editing stays a separate workflow.
 * Code, recruitment status, placement, payments, documents, and photographs are not included.
 */
export const CANDIDATE_SELF_EDIT_FIELDS = [
  "name",
  "email",
  "secondaryEmail",
  "mobile",
  "secondaryMobile",
  "emergencyMobile",
  "nid",
  "bid",
  "dob",
  "gender",
  "bloodGroup",
  "nationality",
  "fatherName",
  "motherName",
  "maritalStatus",
  "height",
  "weight",
] as const;

export type CandidateSelfEditField = (typeof CANDIDATE_SELF_EDIT_FIELDS)[number];

/**
 * Stored profile facts that still have no candidate self-edit rule.
 * The portal shows them and does not save them.
 */
export const CANDIDATE_FIELDS_AWAITING_APPROVAL = [
  "Passport number",
  "Passport issued",
  "Passport expires",
  "Present address",
  "Permanent address",
  "Career",
  "Speciality",
  "Skills",
  "Expertise",
  "Local experience",
  "Abroad experience",
  "Remarks",
] as const;

/** System-controlled information. Candidates cannot change these. */
export const CANDIDATE_LOCKED_FIELD_LABELS = [
  "Candidate code",
  "Recruitment status",
  "Agent",
  "Sub-agent",
  "Class group",
  "Agency",
  "Company",
  "Position",
  "Country",
  "Selection",
  "Company status",
  "Payment",
  "Manpower payment",
  "Documents",
  "Photograph",
] as const;

const ALLOWED = new Set<string>(CANDIDATE_SELF_EDIT_FIELDS);

function optionalText(max: number, label: string) {
  return z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const candidateSelfEditSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Name must be 100 characters or fewer."),
  email: z.string().trim().email("Enter a valid email.").max(250, "Email must be 250 characters or fewer."),
  secondaryEmail: z
    .string()
    .trim()
    .max(250, "Secondary email must be 250 characters or fewer.")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, "Enter a valid secondary email."),
  mobile: optionalText(250, "Mobile"),
  secondaryMobile: optionalText(250, "Secondary mobile"),
  emergencyMobile: optionalText(250, "Emergency mobile"),
  nid: optionalText(250, "NID"),
  bid: optionalText(250, "BID"),
  dob: z.string().trim().refine((value) => value === "" || isIsoDate(value), "Enter a valid date of birth."),
  gender: optionalText(20, "Gender"),
  bloodGroup: optionalText(20, "Blood group"),
  nationality: optionalText(250, "Nationality"),
  fatherName: optionalText(250, "Father"),
  motherName: optionalText(250, "Mother"),
  maritalStatus: optionalText(100, "Marital status"),
  height: optionalText(100, "Height"),
  weight: optionalText(100, "Weight"),
});

export type CandidateSelfEditInput = z.infer<typeof candidateSelfEditSchema>;

export type CandidateSelfEditDetails = Omit<CandidateSelfEditInput, "name" | "email">;

export function parseCandidateSelfEdit(
  payload: Record<string, unknown>,
): { ok: true; data: CandidateSelfEditInput } | { ok: false; error: string; field?: CandidateSelfEditField } {
  const extra = Object.keys(payload).filter((key) => !ALLOWED.has(key));
  if (extra.length > 0) {
    return { ok: false, error: "Those fields cannot be changed from the candidate portal." };
  }
  const input: Record<string, unknown> = {};
  for (const key of CANDIDATE_SELF_EDIT_FIELDS) {
    const value = payload[key];
    if (typeof value !== "string") return { ok: false, error: "Check the profile fields.", field: key };
    input[key] = value;
  }
  const parsed = candidateSelfEditSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      error: issue?.message ?? "Check the profile fields.",
      field: typeof field === "string" && ALLOWED.has(field) ? (field as CandidateSelfEditField) : undefined,
    };
  }
  return { ok: true, data: parsed.data };
}
