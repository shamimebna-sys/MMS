import { describe, expect, it } from "vitest";
import { candidateNavigation, loginDestination, parseOwnedFileRef } from "@/lib/candidate-access";
import { CANDIDATE_SELF_EDIT_FIELDS, parseCandidateSelfEdit } from "@/lib/candidate-self-edit";
import { LIVE_STATUS_CASE, LIVE_STATUS_ORDER, stageMarks, type StageFlags } from "@/lib/candidate-live-status";

const emptyFlags = (): StageFlags => ({
  registration: true,
  profileCv: false,
  group: false,
  interview: false,
  selection: false,
  labour: false,
  policeMedical: false,
  visa: false,
  manpower: false,
  flight: false,
});

describe("shared login destinations", () => {
  it("sends a linked candidate to their file and keeps other roles on the requested page", () => {
    expect(loginDestination({ roleName: "Candidate", candidateId: 45, requested: "/dashboard" })).toEqual({ href: "/candidate" });
    expect(loginDestination({ roleName: "admin", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "Agent", candidateId: null, requested: "/records/candidates" })).toEqual({
      href: "/records/candidates",
    });
    expect(loginDestination({ roleName: "Employee", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "sadmin", candidateId: null, requested: "/candidate" })).toEqual({ href: "/dashboard" });
  });

  it("does not send an unlinked candidate into another person's file", () => {
    expect(loginDestination({ roleName: "Candidate", candidateId: null, requested: "/candidate" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "Candidate", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
  });

  it("does not accept a candidate id inside a file reference", () => {
    expect(parseOwnedFileRef("document.15")).toEqual({ kind: "document", id: 15, index: 0 });
    expect(parseOwnedFileRef("document.15.1")).toEqual({ kind: "document", id: 15, index: 1 });
    expect(parseOwnedFileRef("profile.cv")).toEqual({ kind: "profile", key: "cv", index: 0 });
    expect(parseOwnedFileRef("manpower.certificate.4")).toEqual({ kind: "manpower", column: "certificate", id: 4, index: 0 });
    expect(parseOwnedFileRef("flight.ticket.8.0")).toEqual({ kind: "flight", column: "ticket", id: 8, index: 0 });
    expect(parseOwnedFileRef("document.15?candidate=99")).toBeNull();
    expect(parseOwnedFileRef("candidate.99")).toBeNull();
    expect(parseOwnedFileRef("../passport")).toBeNull();
    expect(parseOwnedFileRef("profile.password")).toBeNull();
  });
});

function editable(overrides: Record<string, string> = {}) {
  return {
    name: "Amina Rahman",
    email: "amina@example.com",
    secondaryEmail: "second@example.com",
    mobile: "01700000000",
    secondaryMobile: "",
    emergencyMobile: "",
    nid: "1234567890",
    bid: "",
    dob: "1994-01-11",
    gender: "F",
    bloodGroup: "A+",
    nationality: "Bangladeshi",
    fatherName: "Karim",
    motherName: "Rina",
    maritalStatus: "Single",
    height: "160",
    weight: "55",
    ...overrides,
  };
}

describe("candidate self-service edit", () => {
  it("allows personal and contact fields and rejects system fields", () => {
    expect(CANDIDATE_SELF_EDIT_FIELDS).toContain("name");
    expect(CANDIDATE_SELF_EDIT_FIELDS).toContain("email");
    expect(CANDIDATE_SELF_EDIT_FIELDS).toContain("mobile");
    expect(CANDIDATE_SELF_EDIT_FIELDS).toContain("nid");
    expect(CANDIDATE_SELF_EDIT_FIELDS).not.toContain("code");
    expect(CANDIDATE_SELF_EDIT_FIELDS).not.toContain("status");
    expect(parseCandidateSelfEdit(editable())).toEqual({ ok: true, data: editable() });
    expect(parseCandidateSelfEdit({ ...editable(), status: "A" }).ok).toBe(false);
    expect(parseCandidateSelfEdit({ ...editable(), code: "C-1" }).ok).toBe(false);
    expect(parseCandidateSelfEdit({ ...editable(), passport_no: "X" }).ok).toBe(false);
    expect(parseCandidateSelfEdit({ ...editable(), agentId: "4" }).ok).toBe(false);
    expect(parseCandidateSelfEdit({ ...editable(), email: "not-an-email" })).toMatchObject({ ok: false, field: "email" });
    expect(parseCandidateSelfEdit({ ...editable(), secondaryEmail: "not-an-email" })).toMatchObject({ ok: false, field: "secondaryEmail" });
    expect(parseCandidateSelfEdit({ ...editable(), dob: "1994-02-31" })).toMatchObject({ ok: false, field: "dob" });
    expect(parseCandidateSelfEdit({ ...editable(), name: "A".repeat(101) })).toMatchObject({ ok: false, field: "name" });
    expect(parseCandidateSelfEdit({ ...editable(), mobile: "" }).ok).toBe(true);
  });

  it("keeps candidate navigation inside the candidate area", () => {
    const hrefs = candidateNavigation().flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toEqual(["/candidate/profile", "/candidate/notices"]);
    expect(hrefs.every((href) => href.startsWith("/candidate/"))).toBe(true);
  });
});

describe("candidate live status", () => {
  it("keeps the ten legacy pipeline names and their step order", () => {
    expect(LIVE_STATUS_ORDER).toEqual([
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
    ]);
  });

  it("maps each stored record to its legacy status and lets a later record win", () => {
    const at = (label: string) => LIVE_STATUS_CASE.indexOf(`THEN '${label}'`);
    expect(LIVE_STATUS_CASE).toContain("FROM flight_schedules f");
    expect(LIVE_STATUS_CASE).toContain("FROM manpower_trainings m");
    expect(LIVE_STATUS_CASE).toContain("FROM visa_immigrations v");
    expect(LIVE_STATUS_CASE).toContain("FROM medicals m");
    expect(LIVE_STATUS_CASE).toContain("FROM police_clearances p");
    expect(LIVE_STATUS_CASE).toContain("FROM labour_contracts l");
    expect(LIVE_STATUS_CASE).toContain("FROM selected_candidates s");
    expect(LIVE_STATUS_CASE).toContain("c.class_group_id IS NOT NULL");
    expect(LIVE_STATUS_CASE).toContain("NULLIF(btrim(c.cv_file_path), '') IS NOT NULL");
    expect(LIVE_STATUS_CASE).toContain("ELSE 'Registration'");
    expect(at("Flight")).toBeLessThan(at("Manpower Status"));
    expect(at("Manpower Status")).toBeLessThan(at("VISA/Work Permite"));
    expect(at("VISA/Work Permite")).toBeLessThan(at("Police Clearance & Medical"));
    expect(at("Police Clearance & Medical")).toBeLessThan(at("Labour Contact"));
    expect(at("Labour Contact")).toBeLessThan(at("Selection"));
    expect(at("Selection")).toBeLessThan(at("Group Name"));
    expect(at("Group Name")).toBeLessThan(at("Profile Update/CV"));
    expect(at("Profile Update/CV")).toBeLessThan(LIVE_STATUS_CASE.indexOf("ELSE 'Registration'"));
    expect(LIVE_STATUS_CASE).not.toContain("THEN 'Interview'");
    expect(LIVE_STATUS_CASE).not.toContain("exam_results");
  });

  it("marks each of the ten steps from its own record", () => {
    const marks = stageMarks("Flight", {
      ...emptyFlags(),
      profileCv: true,
      group: true,
      interview: false,
      selection: true,
      labour: false,
      policeMedical: true,
      visa: true,
      manpower: false,
      flight: true,
    });
    expect(marks.map((stage) => stage.label)).toEqual([...LIVE_STATUS_ORDER]);
    expect(marks.find((stage) => stage.label === "Registration")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Profile Update/CV")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Group Name")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Interview")).toMatchObject({ current: false, onFile: false });
    expect(marks.find((stage) => stage.label === "Selection")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Labour Contact")).toMatchObject({ current: false, onFile: false });
    expect(marks.find((stage) => stage.label === "Police Clearance & Medical")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "VISA/Work Permite")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Manpower Status")).toMatchObject({ current: false, onFile: false });
    expect(marks.find((stage) => stage.label === "Flight")).toMatchObject({ current: true, onFile: true });
  });

  it("does not mark an earlier paper as on file just because a later status is current", () => {
    const marks = stageMarks("Flight", { ...emptyFlags(), flight: true, visa: true });
    expect(marks.find((stage) => stage.label === "Flight")).toMatchObject({ current: true, onFile: true });
    expect(marks.find((stage) => stage.label === "Labour Contact")).toMatchObject({ current: false, onFile: false });
    expect(marks.find((stage) => stage.label === "VISA/Work Permite")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Registration")).toMatchObject({ current: false, onFile: true });
    expect(marks.find((stage) => stage.label === "Interview")).toMatchObject({ current: false, onFile: false });
  });
});
