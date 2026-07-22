import { describe, it, expect } from "vitest";
import { parseQuantityInput } from "@/lib/quantityInput";

describe("parseQuantityInput", () => {
  it("reads a whole number back unchanged", () => {
    expect(parseQuantityInput("3", 0)).toBe(3);
    expect(parseQuantityInput("120", 1)).toBe(120);
  });

  it("allows zero where zero is the minimum", () => {
    expect(parseQuantityInput("0", 0)).toBe(0);
  });

  it("lifts zero to the minimum where one is the minimum", () => {
    expect(parseQuantityInput("0", 1)).toBe(1);
  });

  // The browser hands back an empty string while the field is being edited,
  // and every cart screen used to turn that into its own surprise value.
  it("treats an empty or blank field as the minimum", () => {
    expect(parseQuantityInput("", 0)).toBe(0);
    expect(parseQuantityInput("", 1)).toBe(1);
    expect(parseQuantityInput("   ", 0)).toBe(0);
  });

  it("clamps a negative quantity to the minimum", () => {
    expect(parseQuantityInput("-5", 0)).toBe(0);
    expect(parseQuantityInput("-5", 1)).toBe(1);
  });

  it("rejects a fractional quantity down to the minimum", () => {
    // Stock and pack counts are whole things; there is no half a carton.
    expect(parseQuantityInput("2.5", 0)).toBe(0);
    expect(parseQuantityInput("2.5", 1)).toBe(1);
  });

  it("treats unparseable text as the minimum", () => {
    expect(parseQuantityInput("abc", 0)).toBe(0);
    expect(parseQuantityInput("abc", 1)).toBe(1);
    expect(parseQuantityInput("1e", 1)).toBe(1);
  });

  it("treats NaN and Infinity as the minimum", () => {
    expect(parseQuantityInput("NaN", 0)).toBe(0);
    expect(parseQuantityInput("Infinity", 1)).toBe(1);
    expect(parseQuantityInput("-Infinity", 0)).toBe(0);
  });
});
