import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CandidateProfileEditor } from "@/components/candidate/profile-editor";
import { CANDIDATE_FIELDS_AWAITING_APPROVAL, type CandidateSelfEditDetails } from "@/lib/candidate-self-edit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

vi.mock("@/app/(workspace)/profile/actions", () => ({
  changePasswordAction: vi.fn(),
}));

vi.mock("@/app/(portal)/candidate/(home)/profile/actions", () => ({
  updateCandidateProfileAction: vi.fn(),
}));

const details: CandidateSelfEditDetails = {
  secondaryEmail: "",
  mobile: "01700000000",
  secondaryMobile: "",
  emergencyMobile: "",
  nid: "1234567890",
  bid: "",
  dob: "1994-01-11",
  gender: "F",
  bloodGroup: "",
  nationality: "",
  fatherName: "",
  motherName: "",
  maritalStatus: "",
  height: "",
  weight: "",
};

const locked = [
  { label: "NID", value: "1234567890" },
  { label: "Mobile", value: "01700000000" },
  { label: "Present address", value: "House 4, Dhaka" },
  { label: "Passport", value: "A1234567" },
  { label: "Agent", value: "AG-1 Karim" },
  { label: "Career", value: "Welder" },
];

function renderEditor(photoRef = "profile.photo") {
  return renderToStaticMarkup(
    createElement(CandidateProfileEditor, {
      userId: 9,
      name: "Amina Rahman",
      email: "amina@example.com",
      details,
      code: "C-19",
      status: "Medical",
      avatar: "",
      photoRef,
      locked,
    }),
  );
}

describe("candidate profile editor", () => {
  it("keeps the editable account fields and shows every stored field as read-only", () => {
    const html = renderEditor();
    expect(html).toContain("Edit profile");
    expect(html).toContain("Change Photo");
    expect(html).toContain("Save Changes");
    expect(html).toContain('href="/candidate"');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="mobile"');
    expect(html).toContain('name="nid"');
    expect(html).toContain('name="dob"');
    expect(html).toContain('value="01700000000"');
    expect(html).toContain('value="1234567890"');
    expect(html).not.toContain('id="locked-NID"');
    expect(html).not.toContain('id="locked-Mobile"');
    expect(html).not.toContain('name="code"');
    expect(html).not.toContain('name="status"');
    expect(html).toContain("Amina Rahman");
    expect(html).toContain("amina@example.com");
    expect(html).toContain("C-19");
    expect(html).toContain("Medical");
    expect(html).toContain("Profile information");
    expect(html).toContain("Personal information");
    expect(html).toContain("Contact information");
    expect(html).toContain("Address information");
    expect(html).toContain("Passport information");
    expect(html).toContain("Other information");
    expect(html).toContain("1234567890");
    expect(html).toContain("01700000000");
    expect(html).toContain("House 4, Dhaka");
    expect(html).toContain("A1234567");
    expect(html).toContain("AG-1 Karim");
    expect(html).toContain("Welder");
    expect(html).toContain("The recruitment photograph is stored on the recruitment file and cannot be changed through this portal.");
    expect(html).toContain("/candidate/file?ref=profile.photo");
    expect(html).toContain("Personal fields waiting for an edit rule");
    for (const label of CANDIDATE_FIELDS_AWAITING_APPROVAL) expect(html).toContain(label);
    expect(html).toContain('name="currentPassword"');
    expect(html).toContain('name="newPassword"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).toContain('type="hidden" name="userId" value="9"');
  });

  it("keeps the profile photo picker out of the profile form and accepts only the existing image types", () => {
    const html = renderEditor("");
    expect(html).toContain("No photograph is stored yet.");
    expect(html).not.toContain("cannot be replaced here.");
    const form = html.slice(html.indexOf("<form"));
    expect(form).not.toContain('type="file"');
    expect(html).toContain('type="file"');
    expect(html).toContain("image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp");
    expect(html).not.toContain("Cancel Selection");
  });
});
