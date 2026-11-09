import { describe, expect, it } from "vitest";
import {
  candidateDetailsLabel,
  invoiceCandidateExportLines,
  presentInvoiceCandidate,
  type StoredInvoiceCandidate,
} from "@/lib/invoice-candidates";

const linked: StoredInvoiceCandidate = {
  id: 5,
  candidateId: "18",
  code: "C-18",
  name: "Amina Rahman",
  createdAt: "",
  updatedAt: "",
};

const nameOnly: StoredInvoiceCandidate = {
  id: 6,
  candidateId: "15",
  code: "",
  name: "Karim Uddin",
  createdAt: "",
  updatedAt: "",
};

const missingCandidate: StoredInvoiceCandidate = {
  id: 7,
  candidateId: "999001",
  code: "",
  name: "",
  createdAt: "",
  updatedAt: "",
};

describe("stored invoice candidates", () => {
  it("labels a candidate as (code) name", () => {
    expect(candidateDetailsLabel("C-18", "Amina Rahman")).toBe("(C-18) Amina Rahman");
    expect(presentInvoiceCandidate(linked).label).toBe("(C-18) Amina Rahman");
    expect(presentInvoiceCandidate(linked).candidateId).toBe("18");
  });

  it("omits the parentheses when the code is blank", () => {
    expect(candidateDetailsLabel("", "Karim Uddin")).toBe("Karim Uddin");
    expect(candidateDetailsLabel("   ", "Karim Uddin")).toBe("Karim Uddin");
    expect(presentInvoiceCandidate(nameOnly).label).toBe("Karim Uddin");
  });

  it("keeps a pivot row when the candidate record is missing", () => {
    const view = presentInvoiceCandidate(missingCandidate);
    expect(view.id).toBe(7);
    expect(view.candidateId).toBe("999001");
    expect(view.label).toBe("");
    expect(view.exportText).toContain("label blank");
    expect(view.exportText).toContain("candidate 999001");
  });

  it("leaves null timestamps blank", () => {
    const view = presentInvoiceCandidate(linked);
    expect(view.createdAt).toBe("");
    expect(view.updatedAt).toBe("");
    expect(view.exportText).toContain("created blank");
    expect(view.exportText).toContain("updated blank");
  });

  it("exports each stored link and does not merge them", () => {
    expect(invoiceCandidateExportLines([linked, nameOnly])).toEqual([
      "Candidates",
      "id 5 | candidate 18 | label (C-18) Amina Rahman | created blank | updated blank",
      "id 6 | candidate 15 | label Karim Uddin | created blank | updated blank",
    ]);
    expect(invoiceCandidateExportLines([])).toEqual(["Candidates: none stored"]);
  });
});
