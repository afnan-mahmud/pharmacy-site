import { describe, it, expect } from "vitest";
import {
  MEDICINE_PAGE_SIZE,
  normalizePage,
  pageCount,
  skipFor,
} from "@/lib/pagination";
import { pageWindow } from "@/components/Pager";

describe("normalizePage", () => {
  it("keeps a real page number", () => {
    expect(normalizePage(1)).toBe(1);
    expect(normalizePage(7)).toBe(7);
  });

  it("falls back to page 1 for anything unusable", () => {
    // Server Actions are directly callable, so none of these are hypothetical.
    for (const bad of [0, -3, 1.5, NaN, Infinity, "2", null, undefined, {}]) {
      expect(normalizePage(bad)).toBe(1);
    }
  });
});

describe("pageCount", () => {
  it("counts whole and partial pages", () => {
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
    expect(pageCount(1, 50)).toBe(1);
  });

  it("reports one page when there is nothing, so 'page 1 of 1' reads right", () => {
    expect(pageCount(0, 50)).toBe(1);
  });
});

describe("skipFor", () => {
  it("skips whole pages", () => {
    expect(skipFor(1, 50, 500)).toBe(0);
    expect(skipFor(3, 50, 500)).toBe(100);
  });

  it("clamps a page past the end to the last real page", () => {
    // Otherwise a search that narrows results while the reader is on page 4
    // empties the list, which reads as "everything is gone".
    expect(skipFor(9, 50, 120)).toBe(100);
    expect(skipFor(4, 50, 0)).toBe(0);
  });
});

describe("pageWindow", () => {
  it("lists every page when a gap would hide nothing", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("keeps both endpoints reachable on a long list", () => {
    const w = pageWindow(20, 40);
    expect(w[0]).toBe(1);
    expect(w[w.length - 1]).toBe(40);
    expect(w).toContain(20);
    expect(w).toContain(null); // a gap, not fifty buttons
  });

  it("does not open a gap of one page", () => {
    // An ellipsis standing in for a single number is a slower way to show it.
    for (const page of [1, 2, 3, 15, 19, 20]) {
      const w = pageWindow(page, 20);
      const numbers = w.filter((p): p is number => p !== null);
      for (let i = 1; i < numbers.length; i++) {
        const jump = numbers[i]! - numbers[i - 1]!;
        const gapHere = w.indexOf(numbers[i]!) - w.indexOf(numbers[i - 1]!) > 1;
        if (gapHere) expect(jump).toBeGreaterThan(2);
      }
    }
  });

  it("never repeats or reorders a page number", () => {
    const numbers = pageWindow(10, 30).filter((p): p is number => p !== null);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });
});

describe("page size sanity", () => {
  it("is a positive whole number", () => {
    expect(Number.isInteger(MEDICINE_PAGE_SIZE)).toBe(true);
    expect(MEDICINE_PAGE_SIZE).toBeGreaterThan(0);
  });
});
