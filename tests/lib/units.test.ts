import { describe, it, expect } from "vitest";
import { boxesToPatas, splitStock, formatStock } from "@/lib/units";

describe("boxesToPatas", () => {
  it("multiplies boxes by patas per box", () => {
    expect(boxesToPatas(50, 10)).toBe(500);
    expect(boxesToPatas(1, 12)).toBe(12);
    expect(boxesToPatas(0, 10)).toBe(0);
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => boxesToPatas(5, 0)).toThrow("patasPerBox must be at least 1");
    expect(() => boxesToPatas(5, -1)).toThrow("patasPerBox must be at least 1");
  });

  it("rejects negative boxes", () => {
    expect(() => boxesToPatas(-1, 10)).toThrow("boxes cannot be negative");
  });

  it("rejects fractional input", () => {
    expect(() => boxesToPatas(1.5, 10)).toThrow("boxes must be a whole number");
    expect(() => boxesToPatas(5, 10.5)).toThrow("patasPerBox must be a whole number");
  });

  it("rejects NaN and Infinity", () => {
    expect(() => boxesToPatas(NaN, 10)).toThrow("is not a valid number");
    expect(() => boxesToPatas(Infinity, 10)).toThrow("is not a valid number");
    expect(() => boxesToPatas(5, NaN)).toThrow("is not a valid number");
    expect(() => boxesToPatas(5, Infinity)).toThrow("is not a valid number");
  });
});

describe("splitStock", () => {
  it("splits an exact number of boxes", () => {
    expect(splitStock(500, 10)).toEqual({ boxes: 50, patas: 0 });
  });

  it("splits boxes with a remainder", () => {
    expect(splitStock(498, 10)).toEqual({ boxes: 49, patas: 8 });
  });

  it("handles less than one box", () => {
    expect(splitStock(8, 10)).toEqual({ boxes: 0, patas: 8 });
  });

  it("handles empty stock", () => {
    expect(splitStock(0, 10)).toEqual({ boxes: 0, patas: 0 });
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => splitStock(100, 0)).toThrow("patasPerBox must be at least 1");
    expect(() => splitStock(100, -1)).toThrow("patasPerBox must be at least 1");
  });

  it("rejects a non-integer patasPerBox", () => {
    expect(() => splitStock(100, 10.5)).toThrow("patasPerBox must be a whole number");
  });

  it("rejects negative stockPatas", () => {
    expect(() => splitStock(-1, 10)).toThrow("stockPatas cannot be negative");
  });

  it("rejects a non-integer stockPatas", () => {
    expect(() => splitStock(5.5, 10)).toThrow("stockPatas must be a whole number");
  });

  it("rejects NaN and Infinity", () => {
    expect(() => splitStock(NaN, 10)).toThrow("is not a valid number");
    expect(() => splitStock(Infinity, 10)).toThrow("is not a valid number");
    expect(() => splitStock(100, NaN)).toThrow("is not a valid number");
    expect(() => splitStock(100, Infinity)).toThrow("is not a valid number");
  });
});

describe("formatStock", () => {
  it("shows boxes and patas together", () => {
    expect(formatStock(498, 10, "tablet")).toBe("49 box 8 pata");
  });

  it("omits patas when the split is exact", () => {
    expect(formatStock(500, 10, "tablet")).toBe("50 box");
  });

  it("omits boxes when under one box", () => {
    expect(formatStock(8, 10, "tablet")).toBe("8 pata");
  });

  it("shows empty stock as zero patas", () => {
    expect(formatStock(0, 10, "tablet")).toBe("0 pata");
  });

  it("uses each form's own words", () => {
    expect(formatStock(41, 12, "syrup")).toBe("3 carton 5 bottle");
    expect(formatStock(24, 12, "syrup")).toBe("2 carton");
    expect(formatStock(5, 12, "syrup")).toBe("5 bottle");
    expect(formatStock(7, 5, "injection")).toBe("1 box 2 vial");
    expect(formatStock(3, 6, "cream")).toBe("3 tube");
    expect(formatStock(6, 6, "drops")).toBe("1 box");
  });

  // Medicines saved before the form field existed read back without one.
  it("falls back to box/pata for a missing or unknown form", () => {
    expect(formatStock(498, 10, undefined)).toBe("49 box 8 pata");
    expect(formatStock(498, 10, "ointment")).toBe("49 box 8 pata");
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => formatStock(100, 0, "tablet")).toThrow("patasPerBox must be at least 1");
    expect(() => formatStock(100, -1, "tablet")).toThrow("patasPerBox must be at least 1");
  });

  it("rejects a non-integer patasPerBox", () => {
    expect(() => formatStock(100, 10.5, "tablet")).toThrow("patasPerBox must be a whole number");
  });

  it("renders negative stock with a minus sign", () => {
    expect(formatStock(-1, 10, "tablet")).toBe("-1 pata");
    expect(formatStock(-8, 10, "tablet")).toBe("-8 pata");
    expect(formatStock(-23, 10, "tablet")).toBe("-2 box 3 pata");
    expect(formatStock(-20, 10, "tablet")).toBe("-2 box");
  });

  it("rejects a non-integer stockPatas", () => {
    expect(() => formatStock(5.5, 10, "tablet")).toThrow("stockPatas must be a whole number");
  });

  it("rejects NaN and Infinity", () => {
    expect(() => formatStock(NaN, 10, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(Infinity, 10, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(100, NaN, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(100, Infinity, "tablet")).toThrow("is not a valid number");
  });

  // A bad number must be reported as a bad number, not silently formatted
  // with fallback wording, so the guards have to run before the labels.
  it("falls back to box/pata wording for an unknown form even when negative", () => {
    expect(formatStock(-1, 10, "definitely-not-a-form")).toBe("-1 pata");
  });
});

describe("validation ordering consistency", () => {
  it("reports the same category of error for a doubly-invalid (negative, fractional) value in both guards", () => {
    // -1.5 is both negative and non-integer. Both assertWholeNonNegative
    // (via stockPatas/boxes) and assertPatasPerBox must agree on which
    // check wins: non-integer is reported before negative/range.
    expect(() => boxesToPatas(-1.5, 10)).toThrow("boxes must be a whole number");
    expect(() => splitStock(-1.5, 10)).toThrow("stockPatas must be a whole number");
    expect(() => formatStock(-1.5, 10, "tablet")).toThrow("stockPatas must be a whole number");
    expect(() => boxesToPatas(5, -1.5)).toThrow("patasPerBox must be a whole number");
  });
});
