import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateProfileEditor } from "@/components/candidate/profile-editor";
import { isCandidateRole } from "@/lib/candidate-access";
import type { CandidateSelfEditDetails } from "@/lib/candidate-self-edit";
import { pool } from "@/lib/db";
import { getCurrentUser, sessionAvatar, sessionEmail } from "@/server/current-user";
import { loadCandidatePortal } from "@/server/candidate-portal";

type DetailRow = {
  secondary_email: string | null;
  mobile: string | null;
  secondary_mobile: string | null;
  emergency_mobile: string | null;
  nid: string | null;
  bid: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  nationality: string | null;
  father_name: string | null;
  mother_name: string | null;
  marital_status: string | null;
  height: string | null;
  weight: string | null;
};

function stored(value: string | null): string {
  return value?.trim() ?? "";
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit profile",
};

export default async function CandidateProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCandidateRole(user.roleName) || user.candidateId == null) redirect("/dashboard");
  const [portal, file] = await Promise.all([
    loadCandidatePortal(user.candidateId),
    pool.query<DetailRow>(
      `SELECT secondary_email, mobile, secondary_mobile, emergency_mobile, nid, bid,
              COALESCE(to_char(dob, 'YYYY-MM-DD'), '') AS dob,
              gender, blood_group, nationality, father_name, mother_name, marital_status, height, weight
       FROM candidates
       WHERE id = $1 AND deleted_at IS NULL`,
      [user.candidateId],
    ),
  ]);
  if (!portal) return null;
  const row = file.rows[0];
  const details: CandidateSelfEditDetails = {
    secondaryEmail: stored(row?.secondary_email ?? ""),
    mobile: stored(row?.mobile ?? ""),
    secondaryMobile: stored(row?.secondary_mobile ?? ""),
    emergencyMobile: stored(row?.emergency_mobile ?? ""),
    nid: stored(row?.nid ?? ""),
    bid: stored(row?.bid ?? ""),
    dob: stored(row?.dob ?? ""),
    gender: stored(row?.gender ?? ""),
    bloodGroup: stored(row?.blood_group ?? ""),
    nationality: stored(row?.nationality ?? ""),
    fatherName: stored(row?.father_name ?? ""),
    motherName: stored(row?.mother_name ?? ""),
    maritalStatus: stored(row?.marital_status ?? ""),
    height: stored(row?.height ?? ""),
    weight: stored(row?.weight ?? ""),
  };
  const fileEmail = portal.profile.find((fact) => fact.label === "Email")?.value ?? "";
  const signInEmail = sessionEmail(user);
  const locked = portal.profile.filter((fact) => fact.label !== "Email").concat(portal.application);

  return (
    <CandidateProfileEditor
      userId={user.id}
      name={portal.name}
      email={fileEmail || signInEmail}
      details={details}
      code={portal.code}
      status={portal.liveStatus}
      avatar={sessionAvatar(user)}
      photoRef={portal.photoRef}
      locked={locked}
    />
  );
}
