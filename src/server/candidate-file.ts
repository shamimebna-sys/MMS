import type { AccessUser } from "@/lib/auth/permissions";
import { journeyCompletionFromSource, type JourneyCompletion } from "@/lib/candidate-journey-status";
import { pool } from "@/lib/db";
import type { FormField } from "@/server/bread-form";
import { getResource, visibilitySql } from "@/server/resources";

export type CandidateChip = {
  label: string;
  mark: string;
  href?: string;
};

export type CandidateFile = {
  id: number;
  code: string;
  name: string;
  agency: string;
  photo: string;
  chips: CandidateChip[];
  journey: JourneyCompletion;
};

const STAMP_FIELDS = [
  "code",
  "name",
  "country_id",
  "passport_no",
  "passport_issue_date",
  "passport_expire_date",
  "passport_file_path",
  "stamp_file_path",
  "remarks",
];

const BASIC_FIELDS = [
  "nationality",
  "blood_group",
  "code",
  "name",
  "father_name",
  "mother_name",
  "gender",
  "dob",
  "bid",
  "nid",
  "country_id",
  "passport_no",
  "passport_issue_date",
  "passport_expire_date",
  "cv_file_path",
  "nid_file_path",
  "passport_file_path",
  "present_address_house",
  "permanent_address_house",
  "full_photo_file_path",
  "half_photo_file_path",
  "basic_info_career",
  "basic_info_special",
  "other_skills",
  "local_ex",
  "abroad_ex",
  "height",
  "weight",
  "remarks",
  "status",
  "email",
  "secondary_email",
  "mobile",
  "secondary_mobile",
  "emergency_mobile",
  "agent_id",
  "sub_agent_id",
  "class_group_id",
  "agencier_id",
  "companier_id",
  "position_id",
  "replaced_by_candidate_id",
  "stamp_file_path",
  "password",
  "password_confirmation",
];

export const CANDIDATE_STEPS = [
  { step: 1, label: "Basic Info", href: (id: number) => `/records/candidates/${id}` },
  { step: 2, label: "Passport With Stamp", href: (id: number) => `/records/candidates/${id}?stamp=Y` },
  { step: 3, label: "Police Clearance", href: (id: number) => `/records/police-clearances?candidate=${id}` },
  { step: 4, label: "Medical & Ministry", href: (id: number) => `/records/medicals?candidate=${id}` },
  { step: 5, label: "Visa Immigration", href: (id: number) => `/records/visa-immigrations?candidate=${id}` },
  { step: 6, label: "Manpower", href: (id: number) => `/records/manpower-trainings?candidate=${id}` },
  { step: 7, label: "Flight Schedule", href: (id: number) => `/records/flight-schedules?candidate=${id}` },
  { step: 8, label: "ARC", href: (id: number) => `/records/arcs?candidate=${id}` },
  { step: 9, label: "Labour Contract", href: (id: number) => `/records/labour-contracts?candidate=${id}` },
  { step: 10, label: "Document", href: (id: number) => `/records/candidate-documents?candidate=${id}&create=1` },
  { step: 11, label: "Payment", href: (id: number) => `/records/payment-requests?candidate=${id}&create=1` },
] as const;

export const CANDIDATE_STEP_BY_SLUG: Record<string, number> = {
  "police-clearances": 3,
  medicals: 4,
  "visa-immigrations": 5,
  "manpower-trainings": 6,
  "flight-schedules": 7,
  arcs: 8,
  "labour-contracts": 9,
  "candidate-documents": 10,
  "payment-requests": 11,
  payment_requests: 11,
};

function groupMark(name: string): string {
  const text = name.trim();
  if (!text) return "✕";
  return text.length > 9 ? `${text.slice(0, 7)}..` : text;
}

export function presentCandidateFields(fields: FormField[], stamp: boolean): FormField[] {
  const byName = new Map<string, FormField>();
  for (const field of fields) {
    const existing = byName.get(field.name);
    if (!existing || (existing.input !== "select" && field.input === "select")) byName.set(field.name, field);
  }
  const visibleNames = stamp ? STAMP_FIELDS : BASIC_FIELDS.filter((name) => name !== "stamp_file_path");
  const visible = visibleNames.flatMap((name) => {
    const field = byName.get(name);
    return field ? [field] : [];
  });
  const shown = new Set(visible.map((field) => field.name));
  const preserved = fields
    .filter((field) => !shown.has(field.name) && field.input !== "password")
    .map((field) => ({ ...field, input: "hidden" as const }));
  return [...visible, ...preserved];
}

export async function loadCandidateFile(user: AccessUser, id: number): Promise<CandidateFile | null> {
  const resource = getResource("candidates");
  if (!resource) return null;
  const params: unknown[] = [id];
  const visibility = visibilitySql(resource, user, params);
  const result = await pool.query(
    `SELECT c.id,
            COALESCE(c.code, '') AS code,
            COALESCE(c.name, '') AS name,
            COALESCE(ag.name, '') AS agency,
            COALESCE(NULLIF(btrim(c.half_photo_file_path), ''), NULLIF(btrim(c.full_photo_file_path), ''), '') AS photo,
            COALESCE(g.name, '') AS group_name,
            (c.cv_file_path IS NOT NULL AND btrim(c.cv_file_path) <> '') AS cv,
            (c.stamp_file_path IS NOT NULL AND btrim(c.stamp_file_path) <> '') AS stamp,
            EXISTS (SELECT 1 FROM labour_contracts x WHERE x.candidate_id = c.id) AS labour,
            EXISTS (SELECT 1 FROM police_clearances x WHERE x.candidate_id = c.id) AS police,
            EXISTS (SELECT 1 FROM medicals x WHERE x.candidate_id = c.id) AS medical,
            EXISTS (SELECT 1 FROM visa_immigrations x WHERE x.candidate_id = c.id) AS visa,
            EXISTS (SELECT 1 FROM manpower_trainings x WHERE x.candidate_id = c.id) AS bmet,
            EXISTS (SELECT 1 FROM arcs x WHERE x.candidate_id = c.id) AS arc,
            EXISTS (SELECT 1 FROM candidate_documents x WHERE x.candidate_id = c.id) AS document,
            EXISTS (SELECT 1 FROM payment_requests x WHERE x.candidate_id = c.id) AS payment_request,
            EXISTS (
              SELECT 1 FROM payments p
              WHERE p.candidate_id = c.id AND btrim(COALESCE(p.status, '')) = 'A' AND p.title ILIKE 'Manpower%'
            ) AS manpower,
            EXISTS (SELECT 1 FROM flight_schedules x WHERE x.candidate_id = c.id) AS flight
     FROM candidates c
     LEFT JOIN agenciers ag ON ag.id = c.agencier_id
     LEFT JOIN class_groups g ON g.id = c.class_group_id
     WHERE c.id = $1 AND c.id IN (SELECT id FROM candidates WHERE ${visibility})`,
    params,
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const yes = (value: unknown) => (value === true ? "✓" : "✕");
  const q = (slug: string) => `/records/${slug}?candidate=${id}`;
  return {
    id,
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    agency: String(row.agency ?? ""),
    photo: String(row.photo ?? ""),
    chips: [
      { label: "Registration", mark: "✓", href: `/records/candidates/${id}` },
      { label: "CV Upload", mark: yes(row.cv), href: `/records/candidate-documents?candidate=${id}&create=1` },
      { label: "Class Group", mark: groupMark(String(row.group_name ?? "")), href: `/records/candidates/${id}` },
      { label: "Labour", mark: yes(row.labour), href: q("labour-contracts") },
      { label: "Police Clear.", mark: yes(row.police), href: q("police-clearances") },
      { label: "Visa", mark: yes(row.visa), href: q("visa-immigrations") },
      { label: "BMET Train.", mark: yes(row.bmet), href: q("manpower-trainings") },
      { label: "ARC", mark: yes(row.arc), href: q("arcs") },
      { label: "Manpower", mark: yes(row.manpower), href: `/records/payment-requests?candidate=${id}&create=1&bill_type=manpower` },
      { label: "Flight", mark: yes(row.flight), href: q("flight-schedules") },
    ],
    journey: journeyCompletionFromSource({
      stamp: row.stamp,
      police: row.police,
      medical: row.medical,
      visa: row.visa,
      manpowerTraining: row.bmet,
      flight: row.flight,
      arc: row.arc,
      labour: row.labour,
      document: row.document,
      paymentRequest: row.payment_request,
    }),
  };
}
