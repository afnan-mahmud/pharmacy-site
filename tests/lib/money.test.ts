import { describe, it, expect } from "vitest";
import { takaToPaisa, paisaToTaka, formatTaka } from "@/lib/money";

describe("takaToPaisa", () => {
  it("converts whole taka", () => {
    expect(takaToPaisa(12)).toBe(1200);
  });

  it("converts taka with paisa", () => {
    expect(takaToPaisa(12.5)).toBe(1250);
    expect(takaToPaisa("12.50")).toBe(1250);
    expect(takaToPaisa("0.05")).toBe(5);
  });

  it("does not lose precision on values that float math gets wrong", () => {
    expect(takaToPaisa(1.005)).toBe(101);
    expect(takaToPaisa("8.30")).toBe(830);
  });

  it("accepts zero", () => {
    expect(takaToPaisa(0)).toBe(0);
  });

  it("rejects negative amounts", () => {
    expect(() => takaToPaisa(-1)).toThrow("cannot be negative");
  });

  it("rejects non-numeric input", () => {
    expect(() => takaToPaisa("abc")).toThrow("not a valid number");
    expect(() => takaToPaisa(NaN)).toThrow("not a valid number");
  });

  it("accepts plain decimal strings with surrounding whitespace", () => {
    expect(takaToPaisa(" 12 ")).toBe(1200);
    expect(takaToPaisa("12.5")).toBe(1250);
    expect(takaToPaisa(" 0.05 ")).toBe(5);
    expect(takaToPaisa("0")).toBe(0);
  });

  it("rejects exponential notation", () => {
    expect(() => takaToPaisa("1e3")).toThrow("not a valid number");
  });

  it("rejects hex notation", () => {
    expect(() => takaToPaisa("0x10")).toThrow("not a valid number");
  });

  it("rejects trailing garbage after a number", () => {
    expect(() => takaToPaisa("12abc")).toThrow("not a valid number");
  });

  it("rejects empty or whitespace-only strings", () => {
    expect(() => takaToPaisa("")).toThrow("not a valid number");
    expect(() => takaToPaisa("  ")).toThrow("not a valid number");
  });

  it("rejects comma-grouped input", () => {
    expect(() => takaToPaisa("1,250")).toThrow("not a valid number");
  });

  it("rejects a taka sign prefix", () => {
    expect(() => takaToPaisa("৳12")).toThrow("not a valid number");
  });

  it("rejects an explicit leading plus sign", () => {
    expect(() => takaToPaisa("+12")).toThrow("not a valid number");
  });

  it("still treats a leading minus as negative, not a format error", () => {
    expect(() => takaToPaisa("-5")).toThrow("cannot be negative");
  });
});

describe("paisaToTaka", () => {
  it("converts paisa back to taka", () => {
    expect(paisaToTaka(1250)).toBe(12.5);
    expect(paisaToTaka(0)).toBe(0);
  });
});

describe("formatTaka", () => {
  it("formats with the taka sign and two decimals", () => {
    expect(formatTaka(1250)).toBe("৳12.50");
  });

  it("groups thousands", () => {
    expect(formatTaka(125050)).toBe("৳1,250.50");
    expect(formatTaka(100000000)).toBe("৳1,000,000.00");
  });

  it("formats zero", () => {
    expect(formatTaka(0)).toBe("৳0.00");
  });
});
