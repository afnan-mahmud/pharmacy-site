import { describe, it, expect } from "vitest";
import { filterBuyers } from "@/lib/buyerSearch";

const karim = {
  name: "Karim Uddin",
  shopName: "Karim Medical Hall",
  phone: "01711111111",
  address: "Mirpur",
};
const rahim = {
  name: "Rahim Mia",
  shopName: "Rahim Pharmacy",
  phone: "01822222222",
  address: "Uttara",
};
const shathi = {
  name: "Shathi Akter",
  shopName: "Nabin Drug House",
  phone: "01933333333",
  address: "Mirpur",
};

const buyers = [karim, rahim, shathi];

describe("filterBuyers", () => {
  it("returns everyone for an empty query", () => {
    expect(filterBuyers(buyers, "")).toEqual(buyers);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(filterBuyers(buyers, "   ")).toEqual(buyers);
  });

  it("returns an empty list unchanged", () => {
    expect(filterBuyers([], "karim")).toEqual([]);
  });

  it("matches on the buyer's name", () => {
    expect(filterBuyers(buyers, "rahim mia")).toEqual([rahim]);
  });

  it("matches on the shop name", () => {
    expect(filterBuyers(buyers, "nabin")).toEqual([shathi]);
  });

  it("matches on the phone number", () => {
    expect(filterBuyers(buyers, "01822222222")).toEqual([rahim]);
  });

  it("matches a partial phone number", () => {
    expect(filterBuyers(buyers, "0193")).toEqual([shathi]);
  });

  it("ignores case on both sides", () => {
    expect(filterBuyers(buyers, "KARIM")).toEqual([karim]);
    expect(filterBuyers(buyers, "nAbIn")).toEqual([shathi]);
  });

  // A single substring search over a joined string would fail both of these:
  // the tokens live in different fields.
  it("requires every token to match, across different fields", () => {
    expect(filterBuyers(buyers, "karim 017")).toEqual([karim]);
    expect(filterBuyers(buyers, "shathi nabin")).toEqual([shathi]);
  });

  it("keeps a buyer only when all tokens match", () => {
    expect(filterBuyers(buyers, "karim rahim")).toEqual([]);
  });

  it("collapses extra whitespace between tokens", () => {
    expect(filterBuyers(buyers, "  karim   medical  ")).toEqual([karim]);
  });

  it("excludes a buyer when no field matches", () => {
    expect(filterBuyers(buyers, "jamal")).toEqual([]);
  });

  // Address is deliberately not searched — both Karim and Shathi are in
  // Mirpur, and neither may be found that way.
  it("does not search the address", () => {
    expect(filterBuyers(buyers, "mirpur")).toEqual([]);
  });

  it("preserves the input order", () => {
    expect(filterBuyers(buyers, "1")).toEqual([karim, rahim, shathi]);
  });
});
