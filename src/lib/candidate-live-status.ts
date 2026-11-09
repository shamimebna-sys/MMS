/**
 * Live status used on the candidate board.
 * Names and order are the ten `live_status` rows in the legacy dump (`step_no` 1–10).
 * A later placement record wins even when an earlier paper is missing.
 * Exam results and ARC are not steps in this expression.
 * Interview is one of the ten steps. The legacy schema has no interview tick, so this expression does not assign it.
 */
export const LIVE_STATUS_ORDER = [
  "Registration",
  "Profile Update/CV",
  "Group Name",
  "Interview",
  "Selection",
  "Labour Contact",
  "Police Clearance & Medical",
  "VISA/Work Permite",
  "Manpower Status",
  "Flight",
] as const;

export const LIVE_STATUS_CASE = `CASE
    WHEN EXISTS (SELECT 1 FROM flight_schedules f WHERE f.candidate_id = c.id) THEN 'Flight'
    WHEN EXISTS (SELECT 1 FROM manpower_trainings m WHERE m.candidate_id = c.id) THEN 'Manpower Status'
    WHEN EXISTS (SELECT 1 FROM visa_immigrations v WHERE v.candidate_id = c.id) THEN 'VISA/Work Permite'
    WHEN EXISTS (SELECT 1 FROM medicals m WHERE m.candidate_id = c.id)
      OR EXISTS (SELECT 1 FROM police_clearances p WHERE p.candidate_id = c.id) THEN 'Police Clearance & Medical'
    WHEN EXISTS (SELECT 1 FROM labour_contracts l WHERE l.candidate_id = c.id) THEN 'Labour Contact'
    WHEN EXISTS (SELECT 1 FROM selected_candidates s WHERE s.candidate_id = c.id) THEN 'Selection'
    WHEN c.class_group_id IS NOT NULL THEN 'Group Name'
    WHEN NULLIF(btrim(c.cv_file_path), '') IS NOT NULL THEN 'Profile Update/CV'
    ELSE 'Registration'
  END`;

export type LiveStatusLabel = (typeof LIVE_STATUS_ORDER)[number];

export type StageFlags = {
  registration: boolean;
  profileCv: boolean;
  group: boolean;
  interview: boolean;
  selection: boolean;
  labour: boolean;
  policeMedical: boolean;
  visa: boolean;
  manpower: boolean;
  flight: boolean;
};

const FLAG_BY_LABEL: Record<LiveStatusLabel, keyof StageFlags> = {
  Registration: "registration",
  "Profile Update/CV": "profileCv",
  "Group Name": "group",
  Interview: "interview",
  Selection: "selection",
  "Labour Contact": "labour",
  "Police Clearance & Medical": "policeMedical",
  "VISA/Work Permite": "visa",
  "Manpower Status": "manpower",
  Flight: "flight",
};

export type StageMark = {
  label: LiveStatusLabel;
  current: boolean;
  onFile: boolean;
};

/** Marks only records that exist. A later current status does not fill in earlier papers. */
export function stageMarks(current: string, flags: StageFlags): StageMark[] {
  return LIVE_STATUS_ORDER.map((label) => ({
    label,
    current: label === current,
    onFile: flags[FLAG_BY_LABEL[label]],
  }));
}
