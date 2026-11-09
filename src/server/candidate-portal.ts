import fs from "node:fs/promises";
import type { AccessUser } from "@/lib/auth/permissions";
import { parseOwnedFileRef, type OwnedFileRef } from "@/lib/candidate-access";
import { LIVE_STATUS_CASE, stageMarks, type StageFlags, type StageMark } from "@/lib/candidate-live-status";
import { pool } from "@/lib/db";
import { storedFiles } from "@/lib/media";
import { resolveStoredFile } from "@/server/uploads";

export type PortalFile = {
  ref: string;
  label: string;
  name: string;
};

export type PortalFact = {
  label: string;
  value: string;
};

export type PortalProcess = {
  label: string;
  note: string;
  items: Array<{ title: string; lines: string[]; files: PortalFile[] }>;
};

export type CandidateNotice = {
  title: string;
  detail: string;
  when: string;
};

export type CandidateNotices = {
  notifications: CandidateNotice[];
  announcements: CandidateNotice[];
};

export type CandidatePortalData = {
  name: string;
  code: string;
  photoRef: string;
  liveStatus: string;
  stages: StageMark[];
  profile: PortalFact[];
  application: PortalFact[];
  documents: PortalFile[];
  process: PortalProcess[];
};

type JsonRow = Record<string, unknown>;

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function rows(value: unknown): JsonRow[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRow => item != null && typeof item === "object");
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is JsonRow => item != null && typeof item === "object") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function joinParts(parts: unknown[]): string {
  return parts.map((part) => text(part)).filter(Boolean).join(", ");
}

function filesFrom(value: unknown, refBase: string, label: string): PortalFile[] {
  return storedFiles(text(value)).map((file, index) => ({
    ref: `${refBase}.${index}`,
    label,
    name: file.name || label,
  }));
}

function line(label: string, value: unknown): string {
  const shown = text(value);
  return shown ? `${label}: ${shown}` : "";
}

export async function loadCandidatePortal(candidateId: number): Promise<CandidatePortalData | null> {
  const result = await pool.query(
    `SELECT
       COALESCE(c.code, '') AS code,
       COALESCE(c.name, '') AS name,
       COALESCE(c.email, '') AS email,
       COALESCE(c.secondary_email, '') AS secondary_email,
       COALESCE(c.mobile, '') AS mobile,
       COALESCE(c.secondary_mobile, '') AS secondary_mobile,
       COALESCE(c.emergency_mobile, '') AS emergency_mobile,
       COALESCE(c.passport_no, '') AS passport_no,
       COALESCE(to_char(c.passport_issue_date, 'YYYY-MM-DD'), '') AS passport_issue,
       COALESCE(to_char(c.passport_expire_date, 'YYYY-MM-DD'), '') AS passport_expire,
       COALESCE(c.nid, '') AS nid,
       COALESCE(to_char(c.dob, 'YYYY-MM-DD'), '') AS dob,
       COALESCE(c.gender, '') AS gender,
       COALESCE(c.blood_group, '') AS blood_group,
       COALESCE(c.nationality, '') AS nationality,
       COALESCE(c.father_name, '') AS father_name,
       COALESCE(c.mother_name, '') AS mother_name,
       COALESCE(c.present_address_house, '') AS present_house,
       COALESCE(c.present_address_road, '') AS present_road,
       COALESCE(c.present_address_village, '') AS present_village,
       COALESCE(c.present_address_post, '') AS present_post,
       COALESCE(pt.name, '') AS present_thana,
       COALESCE(pd.name, '') AS present_district,
       COALESCE(pv.name, '') AS present_division,
       COALESCE(c.permanent_address_house, '') AS permanent_house,
       COALESCE(c.permanent_address_road, '') AS permanent_road,
       COALESCE(c.permanent_address_village, '') AS permanent_village,
       COALESCE(c.permanent_address_post, '') AS permanent_post,
       COALESCE(ht.name, '') AS permanent_thana,
       COALESCE(hd.name, '') AS permanent_district,
       COALESCE(hv.name, '') AS permanent_division,
       COALESCE(c.basic_info_career, '') AS career,
       COALESCE(c.basic_info_special, '') AS speciality,
       COALESCE(c.other_skills, '') AS other_skills,
       COALESCE(c.skills, '') AS skills,
       COALESCE(c.expertise, '') AS expertise,
       c.local_ex,
       c.abroad_ex,
       COALESCE(c.height, '') AS height,
       COALESCE(c.weight, '') AS weight,
       COALESCE(c.marital_status, '') AS marital_status,
       COALESCE(c.company_status, '') AS company_status,
       (c.class_group_id IS NOT NULL) AS has_group,
       (NULLIF(btrim(COALESCE(c.half_photo_file_path, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(c.full_photo_file_path, '')), '') IS NOT NULL) AS has_photo,
       COALESCE(c.cv_file_path, '') AS cv_file_path,
       COALESCE(c.nid_file_path, '') AS nid_file_path,
       COALESCE(c.passport_file_path, '') AS passport_file_path,
       COALESCE(c.stamp_file_path, '') AS stamp_file_path,
       COALESCE(c.full_photo_file_path, '') AS full_photo_file_path,
       COALESCE(c.skill_certificate_file_path, '') AS skill_certificate_file_path,
       COALESCE(c.bid_file_path, '') AS bid_file_path,
       ${LIVE_STATUS_CASE} AS live_status,
       CASE WHEN EXISTS (
         SELECT 1 FROM payments p
         WHERE p.candidate_id = c.id AND btrim(COALESCE(p.status, '')) = 'A'
       ) THEN 'Done' ELSE '' END AS payment_label,
       EXISTS (
         SELECT 1 FROM payments p
         WHERE p.candidate_id = c.id AND btrim(COALESCE(p.status, '')) = 'A' AND p.title ILIKE 'Manpower%'
       ) AS manpower_payment,
       CASE WHEN a.id IS NULL THEN ''
            ELSE '(' || COALESCE(a.code, '') || ') ' || COALESCE(a.name, '') END AS agent_label,
       CASE WHEN sa.id IS NULL THEN ''
            ELSE '(' || COALESCE(sa.code, '') || ') ' || COALESCE(sa.name, '') END AS sub_agent_label,
       CASE WHEN g.id IS NULL THEN ''
            ELSE '(' || COALESCE(g.code, '') || ') ' || COALESCE(g.name, '') END AS group_label,
       COALESCE(ag.name, '') AS agency_name,
       COALESCE(co.name, '') AS company_name,
       COALESCE(pos.title, NULLIF(btrim(c.position), ''), '') AS position_name,
       COALESCE(country.name, '') AS country_name,
       COALESCE((
         SELECT json_agg(json_build_object('position', COALESCE(s.position, '')) ORDER BY s.id)
         FROM selected_candidates s WHERE s.candidate_id = c.id
       ), '[]'::json) AS selected_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', d.id,
           'name', COALESCE(dt.name, ''),
           'number', COALESCE(d.document_no, ''),
           'issued', COALESCE(to_char(d.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(d.expire_date, 'YYYY-MM-DD'), ''),
           'file', COALESCE(d.file_path, '')
         ) ORDER BY d.id)
         FROM candidate_documents d
         LEFT JOIN document_types dt ON dt.id = d.document_type_id
         WHERE d.candidate_id = c.id
       ), '[]'::json) AS documents,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', l.id,
           'issued', COALESCE(to_char(l.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(l.expire_date, 'YYYY-MM-DD'), ''),
           'file', COALESCE(l.document_file_path, '')
         ) ORDER BY l.id)
         FROM labour_contracts l WHERE l.candidate_id = c.id
       ), '[]'::json) AS labour_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', p.id,
           'issued', COALESCE(to_char(p.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(p.expire_date, 'YYYY-MM-DD'), ''),
           'place', COALESCE(th.name, ''),
           'file', COALESCE(p.photo_file_path, '')
         ) ORDER BY p.id)
         FROM police_clearances p
         LEFT JOIN thanas th ON th.id = p.thana_id
         WHERE p.candidate_id = c.id
       ), '[]'::json) AS police_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', m.id,
           'issued', COALESCE(to_char(m.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(m.expire_date, 'YYYY-MM-DD'), ''),
           'country', COALESCE(mc.name, ''),
           'file', COALESCE(m.document_file_path, '')
         ) ORDER BY m.id)
         FROM medicals m
         LEFT JOIN countries mc ON mc.id = m.country_id
         WHERE m.candidate_id = c.id
       ), '[]'::json) AS medical_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', v.id,
           'number', COALESCE(v.visa_mp_no, ''),
           'issued', COALESCE(to_char(v.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(v.expire_date, 'YYYY-MM-DD'), ''),
           'file', COALESCE(v.document_file_path, '')
         ) ORDER BY v.id)
         FROM visa_immigrations v WHERE v.candidate_id = c.id
       ), '[]'::json) AS visa_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', t.id,
           'started', COALESCE(to_char(t.training_start_date, 'YYYY-MM-DD'), ''),
           'ended', COALESCE(to_char(t.training_end_date, 'YYYY-MM-DD'), ''),
           'certificateIssued', COALESCE(to_char(t.certificate_issue_date, 'YYYY-MM-DD'), ''),
           'certificateExpires', COALESCE(to_char(t.certificate_expire_date, 'YYYY-MM-DD'), ''),
           'certificate', COALESCE(t.certificate_file_path, ''),
           'paper', COALESCE(t.manpower_file_path, ''),
           'fingerprint', COALESCE(t.finger_print_file_path, '')
         ) ORDER BY t.id)
         FROM manpower_trainings t WHERE t.candidate_id = c.id
       ), '[]'::json) AS manpower_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', r.id,
           'number', COALESCE(r.arc_number, ''),
           'issued', COALESCE(to_char(r.issue_date, 'YYYY-MM-DD'), ''),
           'expires', COALESCE(to_char(r.expire_date, 'YYYY-MM-DD'), ''),
           'lifetime', COALESCE(r.is_lifetime, ''),
           'file', COALESCE(r.acr_file_path, '')
         ) ORDER BY r.id)
         FROM arcs r WHERE r.candidate_id = c.id
       ), '[]'::json) AS arc_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', f.id,
           'airline', COALESCE(f.airlinece_name, ''),
           'date', COALESCE(to_char(f.flight_date, 'YYYY-MM-DD'), ''),
           'time', COALESCE(f.flight_time, ''),
           'departure', COALESCE(f.departure_time, ''),
           'arrival', COALESCE(f.arrival_time, ''),
           'ticket', COALESCE(f.ticket_file_path, ''),
           'seal', COALESCE(f.arrival_seal_page_file_path, '')
         ) ORDER BY f.id)
         FROM flight_schedules f WHERE f.candidate_id = c.id
       ), '[]'::json) AS flight_rows,
       COALESCE((
         SELECT json_agg(json_build_object(
           'exam', COALESCE(e.name, ''),
           'local', er.local_ex,
           'abroad', er.abroad_ex,
           'skill', er.skill,
           'english', er.english,
           'result', COALESCE(er.result, '')
         ) ORDER BY er.id)
         FROM exam_results er
         LEFT JOIN exams e ON e.id = er.exam_id
         WHERE er.candidate_id = c.id
       ), '[]'::json) AS exam_rows
     FROM candidates c
     LEFT JOIN agents a ON a.id = c.agent_id
     LEFT JOIN sub_agents sa ON sa.id = c.sub_agent_id
     LEFT JOIN class_groups g ON g.id = c.class_group_id
     LEFT JOIN agenciers ag ON ag.id = c.agencier_id
     LEFT JOIN companiers co ON co.id = c.companier_id
     LEFT JOIN positions pos ON pos.id = c.position_id
     LEFT JOIN countries country ON country.id = c.country_id
     LEFT JOIN thanas pt ON pt.id = c.present_address_thana_id
     LEFT JOIN districts pd ON pd.id = c.present_address_district_id
     LEFT JOIN divisions pv ON pv.id = c.present_address_division_id
     LEFT JOIN thanas ht ON ht.id = c.permanent_address_thana_id
     LEFT JOIN districts hd ON hd.id = c.permanent_address_district_id
     LEFT JOIN divisions hv ON hv.id = c.permanent_address_division_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [candidateId],
  );
  const row = result.rows[0] as JsonRow | undefined;
  if (!row) return null;

  const selected = rows(row.selected_rows);
  const documents = rows(row.documents);
  const labour = rows(row.labour_rows);
  const police = rows(row.police_rows);
  const medical = rows(row.medical_rows);
  const visa = rows(row.visa_rows);
  const manpower = rows(row.manpower_rows);
  const arc = rows(row.arc_rows);
  const flights = rows(row.flight_rows);
  const exams = rows(row.exam_rows);
  const flags: StageFlags = {
    registration: true,
    profileCv: text(row.cv_file_path) !== "",
    group: row.has_group === true,
    interview: false,
    selection: selected.length > 0,
    labour: labour.length > 0,
    policeMedical: police.length > 0 || medical.length > 0,
    visa: visa.length > 0,
    manpower: manpower.length > 0,
    flight: flights.length > 0,
  };
  const liveStatus = text(row.live_status) || "Registration";
  const profileFiles = [
    ...filesFrom(row.cv_file_path, "profile.cv", "CV"),
    ...filesFrom(row.nid_file_path, "profile.nid", "NID"),
    ...filesFrom(row.passport_file_path, "profile.passport", "Passport"),
    ...filesFrom(row.stamp_file_path, "profile.stamp", "Passport stamp"),
    ...filesFrom(row.full_photo_file_path, "profile.full-photo", "Full photo"),
    ...filesFrom(row.skill_certificate_file_path, "profile.skill", "Skill certificate"),
    ...filesFrom(row.bid_file_path, "profile.bid", "BID"),
  ];
  const submitted = documents.flatMap((item) => {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id < 1) return [];
    const label = text(item.name) || "Document";
    const detail = [text(item.number), text(item.issued) && `issued ${text(item.issued)}`, text(item.expires) && `expires ${text(item.expires)}`]
      .filter(Boolean)
      .join(" · ");
    return filesFrom(item.file, `document.${id}`, detail ? `${label} · ${detail}` : label);
  });
  const processFiles = [
    ...labour.flatMap((item) => filesFrom(item.file, `labour.${Number(item.id)}`, "Labour contract")),
    ...police.flatMap((item) => filesFrom(item.file, `police.${Number(item.id)}`, "Police clearance")),
    ...medical.flatMap((item) => filesFrom(item.file, `medical.${Number(item.id)}`, "Medical")),
    ...visa.flatMap((item) => filesFrom(item.file, `visa.${Number(item.id)}`, "Visa")),
    ...manpower.flatMap((item) => [
      ...filesFrom(item.certificate, `manpower.certificate.${Number(item.id)}`, "Manpower certificate"),
      ...filesFrom(item.paper, `manpower.paper.${Number(item.id)}`, "Manpower paper"),
      ...filesFrom(item.fingerprint, `manpower.fingerprint.${Number(item.id)}`, "Fingerprint"),
    ]),
    ...arc.flatMap((item) => filesFrom(item.file, `arc.${Number(item.id)}`, "ARC")),
    ...flights.flatMap((item) => [
      ...filesFrom(item.ticket, `flight.ticket.${Number(item.id)}`, "Flight ticket"),
      ...filesFrom(item.seal, `flight.seal.${Number(item.id)}`, "Arrival seal"),
    ]),
  ].filter((file) => Number.isFinite(Number(file.ref.split(".").at(-2) ?? file.ref.split(".").at(-1))));

  const facts = (pairs: Array<[string, unknown]>): PortalFact[] =>
    pairs.flatMap(([label, value]) => {
      const shown = text(value);
      return shown ? [{ label, value: shown }] : [];
    });

  const selection = selected.map((item) => text(item.position)).filter(Boolean).join(", ");
  const application = facts([
    ["Agent", row.agent_label],
    ["Sub-agent", row.sub_agent_label],
    ["Class group", row.group_label],
    ["Agency", row.agency_name],
    ["Company", row.company_name],
    ["Position", row.position_name],
    ["Country", row.country_name],
    ["Selection", selection],
    ["Company status", row.company_status],
    ["Payment", text(row.payment_label) === "Done" ? "Done" : ""],
    ["Manpower payment", row.manpower_payment === true ? "Done" : ""],
  ]);

  const process: PortalProcess[] = [];
  const cvFiles = filesFrom(row.cv_file_path, "profile.cv", "CV");
  if (cvFiles.length) {
    process.push({ label: "Profile Update/CV", note: "Stored CV.", items: [{ title: "CV", lines: [], files: cvFiles }] });
  }
  const labourItems = childItems(labour, "Labour contract", (item) => [line("Issued", item.issued), line("Expires", item.expires)], (item) => filesFrom(item.file, `labour.${Number(item.id)}`, "Labour contract"));
  if (labourItems.length) process.push({ label: "Labour Contact", note: "Stored labour contract.", items: labourItems });
  const policeItems = childItems(police, "Police clearance", (item) => [line("Issued", item.issued), line("Expires", item.expires), line("Thana", item.place)], (item) => filesFrom(item.file, `police.${Number(item.id)}`, "Police clearance"));
  const medicalItems = childItems(medical, "Medical", (item) => [line("Issued", item.issued), line("Expires", item.expires), line("Country", item.country)], (item) => filesFrom(item.file, `medical.${Number(item.id)}`, "Medical"));
  const clearanceItems = [...policeItems, ...medicalItems];
  if (clearanceItems.length) {
    process.push({ label: "Police Clearance & Medical", note: "Stored police clearance or medical record.", items: clearanceItems });
  }
  const visaItems = childItems(visa, "Visa", (item) => [line("Visa or MP number", item.number), line("Issued", item.issued), line("Expires", item.expires)], (item) => filesFrom(item.file, `visa.${Number(item.id)}`, "Visa"));
  if (visaItems.length) process.push({ label: "VISA/Work Permite", note: "Stored visa record.", items: visaItems });
  const manpowerItems = childItems(
    manpower,
    "Manpower training",
    (item) => [line("Training start", item.started), line("Training end", item.ended), line("Certificate issued", item.certificateIssued), line("Certificate expires", item.certificateExpires)],
    (item) => [
      ...filesFrom(item.certificate, `manpower.certificate.${Number(item.id)}`, "Certificate"),
      ...filesFrom(item.paper, `manpower.paper.${Number(item.id)}`, "Manpower paper"),
      ...filesFrom(item.fingerprint, `manpower.fingerprint.${Number(item.id)}`, "Fingerprint"),
    ],
  );
  if (manpowerItems.length) process.push({ label: "Manpower Status", note: "Stored manpower training.", items: manpowerItems });
  const flightItems = childItems(
    flights,
    "Flight",
    (item) => [line("Airline", item.airline), line("Date", item.date), line("Time", item.time), line("Departure", item.departure), line("Arrival", item.arrival)],
    (item) => [
      ...filesFrom(item.ticket, `flight.ticket.${Number(item.id)}`, "Ticket"),
      ...filesFrom(item.seal, `flight.seal.${Number(item.id)}`, "Arrival seal"),
    ],
  );
  if (flightItems.length) process.push({ label: "Flight", note: "Stored flight schedule.", items: flightItems });
  const arcItems = childItems(arc, "ARC", (item) => [line("ARC number", item.number), line("Issued", item.issued), line("Expires", item.expires), line("Lifetime", item.lifetime)], (item) => filesFrom(item.file, `arc.${Number(item.id)}`, "ARC"));
  if (arcItems.length) process.push({ label: "ARC", note: "Kept on the file. This does not change the current status.", items: arcItems });
  const examItems = exams.map((item, index) => ({
    title: text(item.exam) || `Exam result ${index + 1}`,
    lines: [line("Local", item.local), line("Abroad", item.abroad), line("Skill", item.skill), line("English", item.english), line("Result", item.result)].filter(Boolean),
    files: [],
  }));
  if (examItems.length) process.push({ label: "Exam results", note: "Recorded beside the file. Exam results do not change the current status.", items: examItems });

  return {
    name: text(row.name),
    code: text(row.code),
    photoRef: row.has_photo === true ? "profile.photo" : "",
    liveStatus,
    stages: stageMarks(liveStatus, flags),
    profile: facts([
      ["Email", row.email],
      ["Secondary email", row.secondary_email],
      ["Mobile", row.mobile],
      ["Secondary mobile", row.secondary_mobile],
      ["Emergency mobile", row.emergency_mobile],
      ["Passport", row.passport_no],
      ["Passport issued", row.passport_issue],
      ["Passport expires", row.passport_expire],
      ["NID", row.nid],
      ["Date of birth", row.dob],
      ["Gender", row.gender],
      ["Blood group", row.blood_group],
      ["Nationality", row.nationality],
      ["Father", row.father_name],
      ["Mother", row.mother_name],
      ["Present address", joinParts([row.present_house, row.present_road, row.present_village, row.present_post, row.present_thana, row.present_district, row.present_division])],
      ["Permanent address", joinParts([row.permanent_house, row.permanent_road, row.permanent_village, row.permanent_post, row.permanent_thana, row.permanent_district, row.permanent_division])],
      ["Career", row.career],
      ["Speciality", row.speciality],
      ["Skills", text(row.skills) || text(row.other_skills)],
      ["Expertise", row.expertise],
      ["Local experience", row.local_ex],
      ["Abroad experience", row.abroad_ex],
      ["Height", row.height],
      ["Weight", row.weight],
      ["Marital status", row.marital_status],
    ]),
    application,
    documents: [...profileFiles, ...submitted, ...processFiles],
    process,
  };
}

function noticeRows(rows: Array<{ title: string; detail: string; when: string }>): CandidateNotice[] {
  return rows.flatMap((row) => {
    const title = text(row.title);
    const detail = text(row.detail);
    const when = text(row.when);
    if (!title && !detail) return [];
    return [{ title: title || "Notice", detail, when }];
  });
}

/** The signed-in user's notifications, plus the same announcement list the workspace dashboard reads. */
export async function loadCandidateNotices(userId: number): Promise<CandidateNotices> {
  const [notifications, announcements] = await Promise.all([
    pool.query(
      `SELECT COALESCE(title, '') AS title,
              COALESCE(message, '') AS detail,
              COALESCE(to_char(created_at, 'YYYY-MM-DD'), '') AS when
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 8`,
      [userId],
    ),
    pool.query(
      `SELECT COALESCE(topic, '') AS title,
              COALESCE(message, '') AS detail,
              COALESCE(to_char(anounce_date, 'YYYY-MM-DD'), '') AS when
       FROM announcements
       ORDER BY anounce_date DESC NULLS LAST, id DESC
       LIMIT 8`,
    ),
  ]);
  return {
    notifications: noticeRows(notifications.rows as Array<{ title: string; detail: string; when: string }>),
    announcements: noticeRows(announcements.rows as Array<{ title: string; detail: string; when: string }>),
  };
}

function childItems(
  list: JsonRow[],
  title: string,
  linesFor: (item: JsonRow) => string[],
  filesFor: (item: JsonRow) => PortalFile[],
): PortalProcess["items"] {
  return list.flatMap((item) => {
    const id = Number(item.id);
    if (!Number.isSafeInteger(id) || id < 1) return [];
    return [{ title, lines: linesFor(item).filter(Boolean), files: filesFor(item) }];
  });
}

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,240}$/;

function storageRoot(): string {
  return (process.env.LEGACY_STORAGE_URL || "https://eujobbd.com/storage").replace(/\/$/, "");
}

function localFileId(path: string): string | null {
  const match = path.match(/^(?:\/)?api\/files\/([a-f0-9]{32})$/);
  return match?.[1] ?? null;
}

async function readOwnedPath(path: string): Promise<{ bytes: Uint8Array; mimeType: string; name: string } | null> {
  const id = localFileId(path);
  if (id) {
    const file = await resolveStoredFile(id);
    if (!file) return null;
    const bytes = await fs.readFile(file.absolute);
    return { bytes, mimeType: file.mimeType, name: file.originalName };
  }
  const relative = path.replace(/^\/+/, "");
  if (!SAFE_PATH.test(relative) || relative.includes("..")) return null;
  const upstream = await fetch(`${storageRoot()}/${relative}`, { redirect: "error" });
  if (!upstream.ok) return null;
  const type = (upstream.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase() || "";
  if (!type.startsWith("image/") && type !== "application/pdf") return null;
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  return { bytes, mimeType: type, name: relative.split("/").pop() || "file" };
}

async function columnValue(candidateId: number, ref: OwnedFileRef): Promise<string | null> {
  if (ref.kind === "profile") {
    const result = await pool.query(
      `SELECT COALESCE(cv_file_path, '') AS cv,
              COALESCE(nid_file_path, '') AS nid,
              COALESCE(passport_file_path, '') AS passport,
              COALESCE(stamp_file_path, '') AS stamp,
              COALESCE(half_photo_file_path, '') AS half_photo,
              COALESCE(full_photo_file_path, '') AS full_photo,
              COALESCE(skill_certificate_file_path, '') AS skill,
              COALESCE(bid_file_path, '') AS bid
       FROM candidates
       WHERE id = $1 AND deleted_at IS NULL`,
      [candidateId],
    );
    const row = result.rows[0] as JsonRow | undefined;
    if (!row) return null;
    if (ref.key === "photo") return text(row.half_photo) || text(row.full_photo);
    if (ref.key === "full-photo") return text(row.full_photo);
    return text(row[ref.key]);
  }
  const id = ref.id;
  if (ref.kind === "document") {
    const result = await pool.query(`SELECT COALESCE(file_path, '') AS file FROM candidate_documents WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "labour") {
    const result = await pool.query(`SELECT COALESCE(document_file_path, '') AS file FROM labour_contracts WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "police") {
    const result = await pool.query(`SELECT COALESCE(photo_file_path, '') AS file FROM police_clearances WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "medical") {
    const result = await pool.query(`SELECT COALESCE(document_file_path, '') AS file FROM medicals WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "visa") {
    const result = await pool.query(`SELECT COALESCE(document_file_path, '') AS file FROM visa_immigrations WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "arc") {
    const result = await pool.query(`SELECT COALESCE(acr_file_path, '') AS file FROM arcs WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  if (ref.kind === "manpower") {
    const column = ref.column === "certificate" ? "certificate_file_path" : ref.column === "paper" ? "manpower_file_path" : "finger_print_file_path";
    const result = await pool.query(`SELECT COALESCE(${column}, '') AS file FROM manpower_trainings WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
    return text(result.rows[0]?.file);
  }
  const column = ref.column === "ticket" ? "ticket_file_path" : "arrival_seal_page_file_path";
  const result = await pool.query(`SELECT COALESCE(${column}, '') AS file FROM flight_schedules WHERE id = $1 AND candidate_id = $2`, [id, candidateId]);
  return text(result.rows[0]?.file);
}

export async function openCandidateFile(user: AccessUser, ref: string): Promise<{ bytes: Uint8Array; mimeType: string; name: string } | null> {
  if (user.roleName !== "Candidate" || user.candidateId == null) return null;
  const parsed = parseOwnedFileRef(ref);
  if (!parsed) return null;
  const stored = await columnValue(user.candidateId, parsed);
  if (!stored) return null;
  const file = storedFiles(stored)[parsed.index];
  if (!file) return null;
  const opened = await readOwnedPath(file.path);
  if (!opened) return null;
  return { ...opened, name: file.name || opened.name };
}
