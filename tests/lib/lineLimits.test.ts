import { describe, it, expect } from "vitest";
import {
  assertLineCount,
  MAX_LINE_ITEMS,
  TOO_MANY_LINES_ERROR,
} from "@/lib/lineLimits";

describe("assertLineCount", () => {
  it("allows a count exactly at the limit", () => {
    expect(() => assertLineCount(MAX_LINE_ITEMS)).not.toThrow();
  });

  it("rejects one past the limit", () => {
    expect(() => assertLineCount(MAX_LINE_ITEMS + 1)).toThrow(
      TOO_MANY_LINES_ERROR,
    );
  });

  it("allows ordinary order sizes", () => {
    expect(() => assertLineCount(0)).not.toThrow();
    expect(() => assertLineCount(1)).not.toThrow();
    expect(() => assertLineCount(150)).not.toThrow();
  });

  it("names the limit in the message so the user knows what to cut to", () => {
    expect(TOO_MANY_LINES_ERROR).toContain(String(MAX_LINE_ITEMS));
  });

  it("keeps the cap well above any real order", () => {
    // Guards against someone "tidying" this down to a number a genuine
    // wholesale restock (~150 lines) would hit.
    expect(MAX_LINE_ITEMS).toBeGreaterThanOrEqual(250);
  });
});
