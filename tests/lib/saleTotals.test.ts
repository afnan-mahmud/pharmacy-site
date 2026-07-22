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

  it("leaves the subtotal untouched by the discount", () => {
    expect(computeTotals(lines, 25, 0).subtotalPaisa).toBe(43000);
  });

  it("takes a whole percent off the subtotal", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, 10, 0);
    expect(discountPaisa).toBe(4300);
    expect(totalPaisa).toBe(38700);
  });

  it("accepts a fractional percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, 2.5, 0);
    expect(discountPaisa).toBe(1075);
    expect(totalPaisa).toBe(41925);
  });

  // 43000 * 7 / 100 is 3010 exactly; 43000 * 7.77 / 100 is 3341.1, which has
  // to land on a whole paisa.
  it("rounds an uneven percent to the nearest paisa", () => {
    expect(computeTotals(lines, 7.77, 0).discountPaisa).toBe(3341);
  });

  // An exact .5 must round up, in the customer's favour.
  it("rounds a half paisa up", () => {
    // 4300 * 1.5 / 100 = 64.5
    expect(computeTotals([{ ratePaisa: 4300, quantity: 1 }], 1.5, 0)
      .discountPaisa).toBe(65);
  });

  // Binary floating point turns some of these products into x.99999...; the
  // guard in computeTotals is what keeps them off the wrong paisa.
  it("is not defeated by floating point", () => {
    expect(computeTotals([{ ratePaisa: 100499, quantity: 1 }], 1, 0)
      .discountPaisa).toBe(1005);
  });

  it("reports no discount at zero percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, 0, 0);
    expect(discountPaisa).toBe(0);
    expect(totalPaisa).toBe(43000);
  });

  it("wipes out the total at a hundred percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, 100, 0);
    expect(discountPaisa).toBe(43000);
    expect(totalPaisa).toBe(0);
  });

  it("keeps the discount and the total consistent", () => {
    const t = computeTotals(lines, 13.5, 0);
    expect(t.totalPaisa).toBe(t.subtotalPaisa - t.discountPaisa);
  });

  it("computes the due as total minus paid", () => {
    const { duePaisa } = computeTotals(lines, 10, 25000);
    expect(duePaisa).toBe(13700);
  });

  it("reports zero due when paid in full", () => {
    const { duePaisa } = computeTotals(lines, 0, 43000);
    expect(duePaisa).toBe(0);
  });

  it("handles an empty sale", () => {
    expect(computeTotals([], 0, 0)).toEqual({
      subtotalPaisa: 0,
      discountPaisa: 0,
      totalPaisa: 0,
      duePaisa: 0,
    });
  });

  it("rejects a percent above a hundred", () => {
    // Otherwise the pharmacy would owe the customer money, which is not a
    // transaction this system supports.
    expect(() => computeTotals(lines, 101, 0)).toThrow(
      "Discount 100% er beshi hote parbe na",
    );
  });

  it("rejects a negative percent", () => {
    expect(() => computeTotals(lines, -1, 0)).toThrow(
      "Discount 0 er kom hote parbe na",
    );
  });

  it("rejects a percent that is not a finite number", () => {
    expect(() => computeTotals(lines, NaN, 0)).toThrow("Discount thik nai");
    expect(() => computeTotals(lines, Infinity, 0)).toThrow("Discount thik nai");
    expect(() => computeTotals(lines, "10" as never, 0)).toThrow(
      "Discount thik nai",
    );
  });

  it("rejects paid greater than the total", () => {
    // Change given back is not modelled; overpayment would produce a
    // negative due that silently becomes a credit nothing tracks.
    expect(() => computeTotals(lines, 0, 50000)).toThrow(
      "Joma taka total er cheye beshi hote parbe na",
    );
  });

  it("counts the discount when checking the paid amount", () => {
    // 10% off 43000 leaves 38700, so 40000 is now an overpayment.
    expect(() => computeTotals(lines, 10, 40000)).toThrow(
      "Joma taka total er cheye beshi hote parbe na",
    );
  });

  it("rejects a negative paid amount", () => {
    expect(() => computeTotals(lines, 0, -1)).toThrow(
      "paidPaisa cannot be negative",
    );
  });

  it("rejects a fractional paid amount", () => {
    expect(() => computeTotals(lines, 0, 0.5)).toThrow(
      "paidPaisa must be a whole number",
    );
  });
});
