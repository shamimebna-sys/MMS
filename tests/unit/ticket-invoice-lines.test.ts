import { describe, expect, it } from "vitest";
import {
  presentTicketInvoiceLine,
  sumStoredTicketLineTotals,
  ticketInvoiceLineExportLines,
  type StoredTicketInvoiceLine,
} from "@/lib/ticket-invoice-lines";

const otherPassenger: StoredTicketInvoiceLine = {
  id: 11,
  candidateId: "",
  name: "Mahedi Azad",
  passportNo: "4234324",
  remarks: "",
  quantity: "1",
  unitPrice: "540",
  total: "540",
  isCandidate: "OTHER",
  createdAt: "2026-01-30 20:06:56",
  updatedAt: "2026-01-30 20:06:56",
};

const candidatePassenger: StoredTicketInvoiceLine = {
  id: 12,
  candidateId: "22",
  name: "Md Emon Hossain",
  passportNo: "A15379532",
  remarks: "",
  quantity: "1",
  unitPrice: "560",
  total: "560",
  isCandidate: "CANDIDATE",
  createdAt: "2026-01-30 20:06:56",
  updatedAt: "2026-01-30 20:06:56",
};

const emptyPlaceholder: StoredTicketInvoiceLine = {
  id: 13,
  candidateId: "",
  name: "",
  passportNo: "",
  remarks: "",
  quantity: "0",
  unitPrice: "0",
  total: "0",
  isCandidate: "CANDIDATE",
  createdAt: "2026-01-30 20:06:56",
  updatedAt: "2026-01-30 20:06:56",
};

const storedTotalDisagrees: StoredTicketInvoiceLine = {
  id: 99,
  candidateId: "17",
  name: "Stored total",
  passportNo: "A00000000",
  remarks: "kept",
  quantity: "2",
  unitPrice: "100",
  total: "50",
  isCandidate: "CANDIDATE",
  createdAt: "",
  updatedAt: "",
};

describe("stored ticket invoice lines", () => {
  it("prints the saved name, link, and amount without multiplying quantity by unit price", () => {
    const view = presentTicketInvoiceLine(storedTotalDisagrees);
    expect(view.quantity).toBe("2");
    expect(view.unitPrice).toBe("100.00");
    expect(view.total).toBe("50.00");
    expect(view.exportText).toContain("total 50.00");
    expect(view.exportText).not.toContain("200.00");
  });

  it("keeps a blank name, passport, remarks, and candidate id blank", () => {
    const view = presentTicketInvoiceLine(emptyPlaceholder);
    expect(view.name).toBe("");
    expect(view.passportNo).toBe("");
    expect(view.remarks).toBe("");
    expect(view.candidateId).toBe("");
    expect(view.isCandidate).toBe("CANDIDATE");
    expect(view.quantity).toBe("0");
    expect(view.total).toBe("0.00");
  });

  it("keeps the stored is_candidate value", () => {
    expect(presentTicketInvoiceLine(otherPassenger).isCandidate).toBe("OTHER");
    expect(presentTicketInvoiceLine(candidatePassenger).candidateId).toBe("22");
  });

  it("sums stored totals, including zero lines", () => {
    expect(sumStoredTicketLineTotals([otherPassenger, candidatePassenger, emptyPlaceholder])).toBe("1100");
    expect(ticketInvoiceLineExportLines([otherPassenger, emptyPlaceholder])).toEqual([
      "Ticket invoice lines",
      "name Mahedi Azad | passport 4234324 | candidate blank | is_candidate OTHER | remarks blank | qty 1 | unit 540.00 | total 540.00 | created 2026-01-30 20:06:56 | updated 2026-01-30 20:06:56",
      "name blank | passport blank | candidate blank | is_candidate CANDIDATE | remarks blank | qty 0 | unit 0.00 | total 0.00 | created 2026-01-30 20:06:56 | updated 2026-01-30 20:06:56",
      "Stored line total: 540.00",
    ]);
  });

  it("reports when a ticket invoice has no stored lines", () => {
    expect(ticketInvoiceLineExportLines([])).toEqual(["Ticket invoice lines: none stored"]);
    expect(sumStoredTicketLineTotals([])).toBeNull();
  });
});
