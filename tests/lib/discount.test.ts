import { describe, it, expect } from "vitest";
import { discountPercent } from "@/lib/discount";

describe("discountPercent", () => {
  it("computes the percent off the MRP", () => {
    expect(discountPercent(60000, 24000)).toBe(60);
    expect(discountPercent(18000, 9900)).toBe(45);
  });

  it("rounds to the nearest whole percent", () => {
    expect(discountPercent(67200, 50400)).toBe(25);
    expect(discountPercent(300, 199)).toBe(34); // 33.67 -> 34
  });

  it("is 0 when there is no MRP", () => {
    expect(discountPercent(0, 24000)).toBe(0);
  });

  it("is 0 when the MRP is not above the price", () => {
    expect(discountPercent(24000, 24000)).toBe(0);
    expect(discountPercent(20000, 24000)).toBe(0);
  });

  it("is 0 for bad input", () => {
    expect(discountPercent(NaN, 100)).toBe(0);
    expect(discountPercent(100, -1)).toBe(0);
  });
});
