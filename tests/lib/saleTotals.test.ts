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

describe("computeTotals — percent discount", () => {
  const lines = [
    { ratePaisa: 12000, quantity: 3 }, // 36000
    { ratePaisa: 1400, quantity: 5 }, // 7000
  ]; // subtotal 43000

  const percent = (p: number) => ({ kind: "percent" as const, percent: p });

  it("sums the lines into the subtotal", () => {
    const { subtotalPaisa } = computeTotals(lines, percent(0), 0);
    expect(subtotalPaisa).toBe(43000);
  });

  it("leaves the subtotal untouched by the discount", () => {
    expect(computeTotals(lines, percent(25), 0).subtotalPaisa).toBe(43000);
  });

  it("takes a whole percent off the subtotal", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(10), 0);
    expect(discountPaisa).toBe(4300);
    expect(totalPaisa).toBe(38700);
  });

  it("accepts a fractional percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(2.5), 0);
    expect(discountPaisa).toBe(1075);
    expect(totalPaisa).toBe(41925);
  });

  it("rounds an uneven percent to the nearest paisa", () => {
    expect(computeTotals(lines, percent(7.77), 0).discountPaisa).toBe(3341);
  });

  it("rounds a half paisa up", () => {
    expect(
      computeTotals([{ ratePaisa: 4300, quantity: 1 }], { kind: "percent", percent: 1.5 }, 0)
        .discountPaisa,
    ).toBe(65);
  });

  it("is not defeated by floating point", () => {
    expect(
      computeTotals([{ ratePaisa: 100499, quantity: 1 }], { kind: "percent", percent: 1 }, 0)
        .discountPaisa,
    ).toBe(1005);
  });

  it("reports no discount at zero percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(0), 0);
    expect(discountPaisa).toBe(0);
    expect(totalPaisa).toBe(43000);
  });

  it("wipes out the total at a hundred percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(100), 0);
    expect(discountPaisa).toBe(43000);
    expect(totalPaisa).toBe(0);
  });

  it("keeps the discount and the total consistent", () => {
    const t = computeTotals(lines, percent(13.5), 0);
    expect(t.totalPaisa).toBe(t.subtotalPaisa - t.discountPaisa);
  });

  it("echoes the percent it was given", () => {
    expect(computeTotals(lines, percent(13.5), 0).discountPercent).toBe(13.5);
  });

  it("computes the due as total minus paid", () => {
    const { duePaisa } = computeTotals(lines, percent(10), 25000);
    expect(duePaisa).toBe(13700);
  });

  it("reports zero due when paid in full", () => {
    const { duePaisa } = computeTotals(lines, percent(0), 43000);
    expect(duePaisa).toBe(0);
  });

  it("produces a negative due (credit) when paid exceeds the total", () => {
    const { duePaisa } = computeTotals(lines, percent(0), 50000);
    expect(duePaisa).toBe(-7000);
  });

  it("counts the discount before computing a credit", () => {
    // 10% off 43000 leaves 38700; paying 40000 overshoots by 1300.
    const { duePaisa } = computeTotals(lines, percent(10), 40000);
    expect(duePaisa).toBe(-1300);
  });

  it("handles an empty sale", () => {
    expect(computeTotals([], percent(0), 0)).toEqual({
      subtotalPaisa: 0,
      discountPercent: 0,
      discountPaisa: 0,
      totalPaisa: 0,
      duePaisa: 0,
    });
  });

  it("rejects a percent above a hundred", () => {
    expect(() => computeTotals(lines, percent(101), 0)).toThrow(
      "Discount 100% er beshi hote parbe na",
    );
  });

  it("rejects a negative percent", () => {
    expect(() => computeTotals(lines, percent(-1), 0)).toThrow(
      "Discount 0 er kom hote parbe na",
    );
  });

  it("rejects a percent that is not a finite number", () => {
    expect(() => computeTotals(lines, percent(NaN), 0)).toThrow("Discount thik nai");
    expect(() => computeTotals(lines, percent(Infinity), 0)).toThrow("Discount thik nai");
    expect(() =>
      computeTotals(lines, { kind: "percent", percent: "10" as never }, 0),
    ).toThrow("Discount thik nai");
  });

  it("rejects a negative paid amount", () => {
    expect(() => computeTotals(lines, percent(0), -1)).toThrow(
      "paidPaisa cannot be negative",
    );
  });

  it("rejects a fractional paid amount", () => {
    expect(() => computeTotals(lines, percent(0), 0.5)).toThrow(
      "paidPaisa must be a whole number",
    );
  });
});

describe("computeTotals — amount discount", () => {
  const lines = [
    { ratePaisa: 12000, quantity: 3 },
    { ratePaisa: 1400, quantity: 5 },
  ]; // subtotal 43000

  const amount = (a: number) => ({ kind: "amount" as const, amountPaisa: a });

  it("takes the exact paisa amount off, no rounding round-trip", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, amount(3341), 0);
    expect(discountPaisa).toBe(3341);
    expect(totalPaisa).toBe(39659);
  });

  it("derives a display percent from the amount", () => {
    expect(computeTotals(lines, amount(4300), 0).discountPercent).toBe(10);
  });

  it("rounds the derived percent to 2 decimals", () => {
    // 1000 / 43000 * 100 = 2.325581...
    expect(computeTotals(lines, amount(1000), 0).discountPercent).toBe(2.33);
  });

  it("rejects an amount above the subtotal", () => {
    expect(() => computeTotals(lines, amount(43001), 0)).toThrow(
      "Discount subtotal er beshi hote parbe na",
    );
  });

  it("allows an amount equal to the subtotal, wiping out the total", () => {
    expect(computeTotals(lines, amount(43000), 0).totalPaisa).toBe(0);
  });

  it("allows a zero amount", () => {
    const { discountPaisa, discountPercent } = computeTotals(lines, amount(0), 0);
    expect(discountPaisa).toBe(0);
    expect(discountPercent).toBe(0);
  });

  it("rejects a negative amount", () => {
    expect(() => computeTotals(lines, amount(-1), 0)).toThrow(
      "Discount 0 er kom hote parbe na",
    );
  });

  it("rejects a fractional amount", () => {
    expect(() => computeTotals(lines, amount(100.5), 0)).toThrow("Discount thik nai");
  });

  it("handles a zero subtotal without dividing by zero", () => {
    const { discountPercent, totalPaisa } = computeTotals([], amount(0), 0);
    expect(discountPercent).toBe(0);
    expect(totalPaisa).toBe(0);
  });
});
