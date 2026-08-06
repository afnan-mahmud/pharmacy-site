import { describe, it, expect } from "vitest";
import { searchTokensFor, tokenPrefixFilter } from "@/lib/searchTokens";

describe("searchTokensFor", () => {
  it("splits a name into lowercased words", () => {
    expect(searchTokensFor("Napa 500mg")).toEqual(["napa", "500mg"]);
  });

  it("treats punctuation as a word boundary", () => {
    // "Napa-500mg" and "Napa 500 mg" have to be findable the same way.
    expect(searchTokensFor("Napa-500mg")).toEqual(["napa", "500mg"]);
    expect(searchTokensFor("Seclo 20 (capsule)")).toEqual([
      "seclo",
      "20",
      "capsule",
    ]);
  });

  it("gathers words from every field it is given", () => {
    const tokens = searchTokensFor("Napa 500mg", "Paracetamol", "Beximco");
    expect(tokens).toContain("napa");
    expect(tokens).toContain("paracetamol");
    expect(tokens).toContain("beximco");
  });

  it("stores a word shared by two fields only once", () => {
    const tokens = searchTokensFor("Paracetamol", "Paracetamol");
    expect(tokens).toEqual(["paracetamol"]);
  });

  it("ignores missing and non-string fields", () => {
    expect(searchTokensFor("Napa", undefined, null, "")).toEqual(["napa"]);
  });

  it("yields nothing for a value with no letters or digits", () => {
    expect(searchTokensFor("---")).toEqual([]);
  });

  it("only ever produces [a-z0-9] tokens", () => {
    // The prefix query interpolates a token straight into a regex without
    // escaping, which is only safe because of this.
    const tokens = searchTokensFor(
      "Na.*pa (500) [mg] $x |y ^z \\w +q ?r {s} Ünïcode",
      "a+b?c",
    );
    for (const token of tokens) {
      expect(token).toMatch(/^[a-z0-9]+$/);
    }
  });
});

describe("tokenPrefixFilter", () => {
  it("returns no filter for a blank query", () => {
    expect(tokenPrefixFilter("")).toBeNull();
    expect(tokenPrefixFilter("   ")).toBeNull();
  });

  it("prefix-matches a single word", () => {
    expect(tokenPrefixFilter("nap")).toEqual({
      searchTokens: { $regex: "^nap" },
    });
  });

  it("requires every word of a multi-word query", () => {
    expect(tokenPrefixFilter("napa 500")).toEqual({
      $and: [
        { searchTokens: { $regex: "^napa" } },
        { searchTokens: { $regex: "^500" } },
      ],
    });
  });

  it("matches nothing when a typed query holds no searchable word", () => {
    // Not the same as an empty box: the reader asked to narrow the list, so
    // handing back the whole catalogue would answer a different question.
    expect(tokenPrefixFilter("...")).toEqual({ searchTokens: { $in: [] } });
    expect(tokenPrefixFilter(".*")).toEqual({ searchTokens: { $in: [] } });
  });

  it("cannot carry a regex out of the query and into the match", () => {
    const patternsIn = (filter: unknown): string[] => {
      const found: string[] = [];
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            if (key === "$regex" && typeof value === "string") found.push(value);
            else walk(value);
          }
        }
      };
      walk(filter);
      return found;
    };

    for (const hostile of [".*", "^a", "a|b", "a{1,9}", "(x)", "[a-z]", "a\\d"]) {
      // Every pattern that reaches Mongo is an anchor plus a bare word —
      // there is no path for a metacharacter from the query to survive.
      for (const pattern of patternsIn(tokenPrefixFilter(hostile))) {
        expect(pattern).toMatch(/^\^[a-z0-9]+$/);
      }
    }
  });

  it("lowercases the query so case never has to be matched at query time", () => {
    expect(tokenPrefixFilter("NAPA")).toEqual({
      searchTokens: { $regex: "^napa" },
    });
  });
});
