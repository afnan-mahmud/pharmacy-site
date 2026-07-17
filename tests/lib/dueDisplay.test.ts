import { describe, it, expect } from "vitest";
import { describeDue } from "@/lib/dueDisplay";

describe("describeDue", () => {
  it("labels a positive balance as Baki owed by the buyer", () => {
    const result = describeDue(60000);
    expect(result.label).toBe("Baki");
    expect(result.amountText).toBe("৳600.00");
  });

  it("labels a negative balance as Joma ache (buyer credit), shown as a positive amount", () => {
    const result = describeDue(-60000);
    expect(result.label).toBe("Joma ache");
    expect(result.amountText).toBe("৳600.00");
  });

  it("labels a zero balance as Baki nei", () => {
    const result = describeDue(0);
    expect(result.label).toBe("Baki nei");
    expect(result.amountText).toBe("৳0.00");
  });
});
