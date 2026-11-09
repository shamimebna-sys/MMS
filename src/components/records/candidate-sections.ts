import type { FormField } from "@/server/bread-form";

export type CandidateSection = {
  key: string;
  title: string;
  description: string;
  names: readonly string[];
};

/** Display groups for the candidate create form. Names are existing columns; unlisted fields stay in Additional details. */
export const CANDIDATE_CREATE_SECTIONS: readonly CandidateSection[] = [
  {
    key: "basic",
    title: "Basic Information",
    description: "Code, name, family names, gender, and date of birth.",
    names: ["code", "name", "father_name", "mother_name", "gender", "dob"],
  },
  {
    key: "identity",
    title: "Identity & Passport",
    description: "Identity numbers, country, and passport dates.",
    names: ["bid", "nid", "country_id", "passport_no", "passport_issue_date", "passport_expire_date"],
  },
  {
    key: "contact",
    title: "Contact Information",
    description: "Email addresses and phone numbers.",
    names: ["email", "secondary_email", "mobile", "secondary_mobile", "emergency_mobile"],
  },
  {
    key: "documents",
    title: "Candidate Documents",
    description: "CV, identity files, and photos stored on this candidate.",
    names: ["cv_file_path", "nid_file_path", "passport_file_path", "full_photo_file_path", "half_photo_file_path"],
  },
  {
    key: "address",
    title: "Address Information",
    description: "Present and permanent addresses.",
    names: ["present_address_house", "permanent_address_house"],
  },
  {
    key: "relations",
    title: "Agent & Business Relations",
    description: "Agent, group, agency, company, and position links.",
    names: ["agent_id", "sub_agent_id", "class_group_id", "agencier_id", "companier_id", "position_id", "replaced_by_candidate_id"],
  },
  {
    key: "experience",
    title: "Experience & Skills",
    description: "Experience, skills, and the about text stored on this candidate.",
    names: ["local_ex", "abroad_ex", "basic_info_special", "other_skills", "basic_info_career"],
  },
  {
    key: "physical",
    title: "Physical Information & Remarks",
    description: "Height, weight, and remarks.",
    names: ["height", "weight", "remarks"],
  },
  {
    key: "access",
    title: "User Access",
    description: "Password fields for this candidate.",
    names: ["password", "password_confirmation"],
  },
  {
    key: "status",
    title: "Candidate Status",
    description: "The status stored on this candidate.",
    names: ["status"],
  },
] as const;

export type PlacedCandidateField<T> = { field: T; index: number };

/** Group candidate create fields for display. Hidden fields stay hidden, and every field is kept once. */
export function arrangeCandidateFields<T extends { name: string; input: string }>(fields: T[]): {
  hidden: PlacedCandidateField<T>[];
  sections: Array<CandidateSection & { items: PlacedCandidateField<T>[] }>;
} {
  const tagged = fields.map((field, index) => ({ field, index }));
  const hidden = tagged.filter((item) => item.field.input === "hidden");
  const visible = tagged.filter((item) => item.field.input !== "hidden");
  const claimed = new Set<number>();
  const sections = CANDIDATE_CREATE_SECTIONS.map((section) => {
    const items: PlacedCandidateField<T>[] = [];
    for (const name of section.names) {
      for (const item of visible) {
        if (item.field.name !== name || claimed.has(item.index)) continue;
        items.push(item);
        claimed.add(item.index);
      }
    }
    return { ...section, items };
  }).filter((section) => section.items.length > 0);
  const unclaimed = visible.filter((item) => !claimed.has(item.index));
  const extraFiles = unclaimed.filter((item) => item.field.input === "file");
  const rest = unclaimed.filter((item) => item.field.input !== "file");
  if (extraFiles.length > 0) {
    const documents = sections.find((section) => section.key === "documents");
    if (documents) documents.items.push(...extraFiles);
    else {
      const defined = CANDIDATE_CREATE_SECTIONS.find((section) => section.key === "documents");
      sections.splice(
        sections.findIndex((section) => section.key === "address") === -1 ? sections.length : sections.findIndex((section) => section.key === "address"),
        0,
        {
          key: "documents",
          title: defined?.title ?? "Candidate Documents",
          description: defined?.description ?? "Files stored on this candidate.",
          names: extraFiles.map((item) => item.field.name),
          items: extraFiles,
        },
      );
    }
  }
  if (rest.length > 0) {
    sections.push({
      key: "details",
      title: "Additional details",
      description: "Other fields stored on this candidate.",
      names: rest.map((item) => item.field.name),
      items: rest,
    });
  }
  return { hidden, sections };
}

const LIVE_CANDIDATE_CREATE_ORDER = [
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
  "password",
  "password_confirmation",
] as const;

const LIVE_CANDIDATE_CREATE_REQUIRED = new Set(["name", "passport_no", "email", "mobile", "agent_id", "class_group_id"]);

const LIVE_CANDIDATE_HIDDEN_DEFAULTS: Record<string, string> = {
  nationality: "Bangladesh",
  blood_group: "A+",
};

/** Keep the candidate create form to the fields on the live Add Candidate page. */
export function alignCandidateCreateFields(fields: FormField[]): FormField[] {
  const preferred = new Map<string, FormField>();
  for (const field of fields) {
    const current = preferred.get(field.name);
    if (!current || (field.input === "select" && current.input !== "select")) preferred.set(field.name, { ...field });
  }
  const aligned: FormField[] = [];
  for (const name of LIVE_CANDIDATE_CREATE_ORDER) {
    if (name === "password" || name === "password_confirmation") {
      aligned.push({
        name,
        label: name === "password" ? "Password" : "Re-Password",
        input: "text",
        required: false,
        multiple: false,
        options: [],
        value: "",
      });
      continue;
    }
    const field = preferred.get(name);
    if (!field) continue;
    const next: FormField = { ...field, required: LIVE_CANDIDATE_CREATE_REQUIRED.has(name) };
    if (name === "code") {
      next.readOnly = true;
      if (!next.value.trim()) next.placeholder = "#######";
    }
    const hiddenDefault = LIVE_CANDIDATE_HIDDEN_DEFAULTS[name];
    if (hiddenDefault != null) {
      next.input = "hidden";
      if (!next.value) next.value = hiddenDefault;
    }
    if (name === "mobile" || name === "secondary_mobile" || name === "emergency_mobile") next.maxLength = 14;
    if (name === "full_photo_file_path" || name === "half_photo_file_path") next.accept = "image/*";
    if (name === "cv_file_path" || name === "nid_file_path" || name === "passport_file_path") next.accept = null;
    aligned.push(next);
  }
  const carried = fields.filter((field) => field.input === "hidden" && !aligned.some((item) => item.name === field.name));
  return [...aligned, ...carried];
}
