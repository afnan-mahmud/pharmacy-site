import { describe, it, expect } from "vitest";
import { parseTakaInput, parsePercentInput } from "@/lib/takaInput";

describe("parseTakaInput", () => {
  it("reads a taka amount back as paisa", () => {
    expect(parseTakaInput("12")).toBe(1200);
    expect(parseTakaInput("12.50")).toBe(1250);
    expect(parseTakaInput("  7.05  ")).toBe(705);
  });

  it("treats an empty or blank box as zero", () => {
    // The browser reports an empty string while the field is being edited;
    // that is "nothing typed yet", not "unusable".
    expect(parseTakaInput("")).toBe(0);
    expect(parseTakaInput("   ")).toBe(0);
  });

  // The whole point of the guard: takaToPaisa throws on these, and the call
  // sites run during render, where a throw is a blank white page.
  it("returns null instead of throwing on a negative amount", () => {
    expect(parseTakaInput("-5")).toBeNull();
    expect(parseTakaInput("-0.01")).toBeNull();
  });

  it("returns null instead of throwing on unparseable text", () => {
    expect(parseTakaInput("abc")).toBeNull();
    expect(parseTakaInput("1e5")).toBeNull();
    expect(parseTakaInput("--3")).toBeNull();
  });
});

describe("parsePercentInput", () => {
  it("reads a whole or fractional percent back unchanged", () => {
    expect(parsePercentInput("10")).toBe(10);
    expect(parsePercentInput("7.5")).toBe(7.5);
  });

  it("treats an empty or blank box as zero", () => {
    expect(parsePercentInput("")).toBe(0);
    expect(parsePercentInput("   ")).toBe(0);
  });

  it("returns null on a negative or unparseable percent", () => {
    expect(parsePercentInput("-1")).toBeNull();
    expect(parsePercentInput("abc")).toBeNull();
    expect(parsePercentInput("Infinity")).toBeNull();
  });

  // Above 100 is a real number, so it parses; computeTotals is what rejects
  // it, with a message that says why (see src/lib/saleTotals.ts).
  it("leaves an over-100 percent for computeTotals to reject", () => {
    expect(parsePercentInput("150")).toBe(150);
  });
});
