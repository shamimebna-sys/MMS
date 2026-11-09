import { describe, expect, it } from "vitest";
import { invoiceLineExportLines, presentInvoiceLine, sumStoredLineTotals, type StoredInvoiceLine } from "@/lib/invoice-lines";

const contractStamps: StoredInvoiceLine = {
  id: 385,
  description: "Contract Stamps",
  quantity: "1",
  unitPrice: "20",
  subTotal: "20",
  vatRate: "0",
  vatAmount: "0",
  total: "20",
};

const officeFee: StoredInvoiceLine = {
  id: 400,
  description: "Office Administration Fee/Our Services Fee (VAT 19%)",
  quantity: "1",
  unitPrice: "200",
  subTotal: "200",
  vatRate: "19.000000",
  vatAmount: "38",
  total: "238",
};

const blankCharge: StoredInvoiceLine = {
  id: 389,
  description: "DHL Fee/Courier Services Fee",
  quantity: "",
  unitPrice: "",
  subTotal: "0",
  vatRate: "0",
  vatAmount: "0",
  total: "0",
};

describe("stored invoice lines", () => {
  it("prints the saved amounts and does not apply the VAT rate again", () => {
    const view = presentInvoiceLine(officeFee);
    expect(view.unitPrice).toBe("200.00");
    expect(view.subTotal).toBe("200.00");
    expect(view.vatRate).toBe("19");
    expect(view.vatAmount).toBe("38.00");
    expect(view.total).toBe("238.00");
    expect(view.exportText).toBe(
      "Office Administration Fee/Our Services Fee (VAT 19%) | qty 1 | unit 200.00 | subtotal 200.00 | vat rate 19 | vat 38.00 | total 238.00",
    );
  });

  it("keeps a blank quantity and unit price blank", () => {
    const view = presentInvoiceLine(blankCharge);
    expect(view.quantity).toBe("");
    expect(view.unitPrice).toBe("");
    expect(view.total).toBe("0.00");
  });

  it("sums stored totals, including zero lines", () => {
    expect(sumStoredLineTotals([contractStamps, officeFee, blankCharge])).toBe("258");
    expect(invoiceLineExportLines([contractStamps, officeFee])).toEqual([
      "Invoice lines",
      "Contract Stamps | qty 1 | unit 20.00 | subtotal 20.00 | vat rate 0 | vat 0.00 | total 20.00",
      "Office Administration Fee/Our Services Fee (VAT 19%) | qty 1 | unit 200.00 | subtotal 200.00 | vat rate 19 | vat 38.00 | total 238.00",
      "Stored line total: 258.00",
    ]);
  });

  it("reports when an invoice has no stored lines", () => {
    expect(invoiceLineExportLines([])).toEqual(["Invoice lines: none stored"]);
    expect(sumStoredLineTotals([])).toBeNull();
  });
});
