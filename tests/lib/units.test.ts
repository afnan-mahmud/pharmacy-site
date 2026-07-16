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
});

describe("formatStock", () => {
  it("shows boxes and patas together", () => {
    expect(formatStock(498, 10)).toBe("49 box 8 pata");
  });

  it("omits patas when the split is exact", () => {
    expect(formatStock(500, 10)).toBe("50 box");
  });

  it("omits boxes when under one box", () => {
    expect(formatStock(8, 10)).toBe("8 pata");
  });

  it("shows empty stock as zero patas", () => {
    expect(formatStock(0, 10)).toBe("0 pata");
  });
});
