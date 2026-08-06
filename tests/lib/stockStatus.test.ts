import { describe, it, expect } from "vitest";
import { stockStatus, stockStatusLabel } from "@/lib/stockStatus";

describe("stockStatus", () => {
  it("is out at zero, and at the negative a sale can leave behind", () => {
    // This used to report "low" so that the buyer portal would still let
    // people order. It does still let them — the portal treats this as a
    // label, not a gate — so the label can tell the truth.
    expect(stockStatus(0, 20)).toBe("out");
    expect(stockStatus(-5, 20)).toBe("out");
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

  it("treats a zero threshold as no alert — anything above empty is in", () => {
    expect(stockStatus(1, 0)).toBe("in");
    expect(stockStatus(500, 0)).toBe("in");
    // Empty is empty whether or not an alert level was ever set.
    expect(stockStatus(0, 0)).toBe("out");
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
