import { describe, it, expect } from "vitest";
import { stockStatus, stockStatusLabel } from "@/lib/stockStatus";

describe("stockStatus", () => {
  it("is low at zero or negative stock to allow backorders", () => {
    expect(stockStatus(0, 20)).toBe("low");
    expect(stockStatus(-5, 20)).toBe("low");
  });

  it("is low at or below the threshold", () => {
    expect(stockStatus(20, 20)).toBe("low");
    expect(stockStatus(5, 20)).toBe("low");
    expect(stockStatus(1, 20)).toBe("low");
  });

  it("is in above the threshold", () => {
    expect(stockStatus(21, 20)).toBe("in");
    expect(stockStatus(900, 20)).toBe("in");
  });

  it("treats a zero threshold as no alert — anything above empty is in, 0 is low", () => {
    expect(stockStatus(1, 0)).toBe("in");
    expect(stockStatus(500, 0)).toBe("in");
    expect(stockStatus(0, 0)).toBe("low");
  });

  it("never returns a raw number — only the three-way signal", () => {
    expect(["in", "low", "out"]).toContain(stockStatus(42, 10));
  });
});

describe("stockStatusLabel", () => {
  it("labels each status", () => {
    expect(stockStatusLabel("in")).toBe("In Stock");
    expect(stockStatusLabel("low")).toBe("Low Stock");
    expect(stockStatusLabel("out")).toBe("Out of Stock");
  });
});
