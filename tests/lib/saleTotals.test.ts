import { describe, it, expect } from "vitest";
import { lineTotal, computeTotals } from "@/lib/saleTotals";

describe("lineTotal", () => {
  it("multiplies rate by quantity", () => {
    expect(lineTotal({ ratePaisa: 1200, quantity: 3 })).toBe(3600);
  });

  it("handles a zero quantity", () => {
    expect(lineTotal({ ratePaisa: 1200, quantity: 0 })).toBe(0);
  });

  it("rejects a fractional rate", () => {
    expect(() => lineTotal({ ratePaisa: 12.5, quantity: 1 })).toThrow(
      "ratePaisa must be a whole number",
    );
  });

  it("rejects a fractional quantity", () => {
    expect(() => lineTotal({ ratePaisa: 1200, quantity: 1.5 })).toThrow(
      "quantity must be a whole number",
    );
  });

  it("rejects a negative rate", () => {
    expect(() => lineTotal({ ratePaisa: -1, quantity: 1 })).toThrow(
      "ratePaisa cannot be negative",
    );
  });
});

describe("computeTotals", () => {
  const lines = [
    { ratePaisa: 12000, quantity: 3 }, // 36000
    { ratePaisa: 1400, quantity: 5 }, // 7000
  ];

  it("sums the lines into the subtotal", () => {
    const { subtotalPaisa } = computeTotals(lines, 0, 0);
    expect(subtotalPaisa).toBe(43000);
  });

  it("subtracts the discount from the subtotal", () => {
    const { totalPaisa } = computeTotals(lines, 3000, 0);
    expect(totalPaisa).toBe(40000);
  });

  it("computes the due as total minus paid", () => {
    const { duePaisa } = computeTotals(lines, 3000, 25000);
    expect(duePaisa).toBe(15000);
  });

  it("reports zero due when paid in full", () => {
    const { duePaisa } = computeTotals(lines, 0, 43000);
    expect(duePaisa).toBe(0);
  });

  it("handles an empty sale", () => {
    expect(computeTotals([], 0, 0)).toEqual({
      subtotalPaisa: 0,
      totalPaisa: 0,
      duePaisa: 0,
    });
  });

  it("rejects a discount larger than the subtotal", () => {
    // Otherwise the pharmacy would owe the customer money, which is not a
    // transaction this system supports.
    expect(() => computeTotals(lines, 50000, 0)).toThrow(
      "Discount total er cheye beshi hote parbe na",
    );
  });

  it("allows a discount exactly equal to the subtotal", () => {
    expect(computeTotals(lines, 43000, 0).totalPaisa).toBe(0);
  });

  it("rejects paid greater than the total", () => {
    // Change given back is not modelled; overpayment would produce a
    // negative due that silently becomes a credit nothing tracks.
    expect(() => computeTotals(lines, 0, 50000)).toThrow(
      "Joma taka total er cheye beshi hote parbe na",
    );
  });

  it("rejects a negative discount", () => {
    expect(() => computeTotals(lines, -1, 0)).toThrow(
      "discountPaisa cannot be negative",
    );
  });

  it("rejects a negative paid amount", () => {
    expect(() => computeTotals(lines, 0, -1)).toThrow(
      "paidPaisa cannot be negative",
    );
  });

  it("rejects a fractional discount", () => {
    expect(() => computeTotals(lines, 0.5, 0)).toThrow(
      "discountPaisa must be a whole number",
    );
  });
});
