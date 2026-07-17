import { describe, it, expect } from "vitest";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";

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

describe("splitDueTotals", () => {
  it("is zero for nobody", () => {
    expect(splitDueTotals([])).toEqual({ totalDuePaisa: 0, totalCreditPaisa: 0 });
  });

  it("sums what buyers owe", () => {
    expect(splitDueTotals([{ duePaisa: 12000 }, { duePaisa: 3000 }])).toEqual({
      totalDuePaisa: 15000,
      totalCreditPaisa: 0,
    });
  });

  it("reports credit separately as a positive figure", () => {
    expect(splitDueTotals([{ duePaisa: -12000 }])).toEqual({
      totalDuePaisa: 0,
      totalCreditPaisa: 12000,
    });
  });

  it("never lets one buyer's credit hide another's debt", () => {
    // Netted, this would read as 0 owed — and the owner would stop chasing
    // the 12000 he is actually owed.
    expect(splitDueTotals([{ duePaisa: 12000 }, { duePaisa: -12000 }])).toEqual({
      totalDuePaisa: 12000,
      totalCreditPaisa: 12000,
    });
  });

  it("ignores settled buyers", () => {
    expect(splitDueTotals([{ duePaisa: 0 }, { duePaisa: 5000 }])).toEqual({
      totalDuePaisa: 5000,
      totalCreditPaisa: 0,
    });
  });
});
