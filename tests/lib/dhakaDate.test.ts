import { describe, it, expect } from "vitest";
import {
  dhakaToday,
  dhakaDayBounds,
  dhakaRangeBounds,
  formatDhakaDate,
  formatDhakaDateTime,
} from "@/lib/dhakaDate";

describe("dhakaToday", () => {
  it("returns the Dhaka date, not the UTC date", () => {
    // 22:30 UTC on the 16th is already 04:30 on the 17th in Dhaka (UTC+6).
    // A UTC-based "today" would report the 16th and file the owner's late
    // evening sales under yesterday.
    expect(dhakaToday(new Date("2026-07-16T22:30:00Z"))).toBe("2026-07-17");
  });

  it("still reports the previous day just before Dhaka midnight", () => {
    // 17:59 UTC is 23:59 in Dhaka on the same date.
    expect(dhakaToday(new Date("2026-07-17T17:59:00Z"))).toBe("2026-07-17");
  });

  it("rolls over exactly at Dhaka midnight", () => {
    // 18:00 UTC is 00:00 the next day in Dhaka.
    expect(dhakaToday(new Date("2026-07-17T18:00:00Z"))).toBe("2026-07-18");
  });

  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(dhakaToday(new Date("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });
});

describe("dhakaDayBounds", () => {
  it("starts at Dhaka midnight, which is 18:00 UTC the previous day", () => {
    const { start } = dhakaDayBounds("2026-07-17");
    expect(start.toISOString()).toBe("2026-07-16T18:00:00.000Z");
  });

  it("ends at the next Dhaka midnight, exclusive", () => {
    const { end } = dhakaDayBounds("2026-07-17");
    expect(end.toISOString()).toBe("2026-07-17T18:00:00.000Z");
  });

  it("spans exactly 24 hours", () => {
    const { start, end } = dhakaDayBounds("2026-07-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("brackets a sale made late in the Dhaka evening", () => {
    // 22:30 Dhaka on the 17th = 16:30 UTC on the 17th.
    const sale = new Date("2026-07-17T16:30:00Z");
    const { start, end } = dhakaDayBounds("2026-07-17");
    expect(sale >= start && sale < end).toBe(true);
  });

  it("excludes a sale made just after Dhaka midnight", () => {
    // 00:30 Dhaka on the 18th = 18:30 UTC on the 17th.
    const sale = new Date("2026-07-17T18:30:00Z");
    const { end } = dhakaDayBounds("2026-07-17");
    expect(sale < end).toBe(false);
  });

  it("handles a month boundary", () => {
    const { start } = dhakaDayBounds("2026-08-01");
    expect(start.toISOString()).toBe("2026-07-31T18:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => dhakaDayBounds("17-07-2026")).toThrow("Date ta YYYY-MM-DD hote hobe");
    expect(() => dhakaDayBounds("")).toThrow("Date ta YYYY-MM-DD hote hobe");
    expect(() => dhakaDayBounds("2026-13-01")).toThrow("Date ta thik na");
  });

  it("rejects a calendar day that does not exist, instead of rolling it over", () => {
    // February 2026 has 28 days; Date.parse would silently normalize this
    // to March 1st instead of rejecting it.
    expect(() => dhakaDayBounds("2026-02-30")).toThrow("Date ta thik na");
  });

  it("rejects Feb 29 in a non-leap year", () => {
    // 2023 is not a leap year; Date.parse would roll this to March 1st.
    expect(() => dhakaDayBounds("2023-02-29")).toThrow("Date ta thik na");
  });

  it("rejects April 31st, since April has only 30 days", () => {
    expect(() => dhakaDayBounds("2026-04-31")).toThrow("Date ta thik na");
  });

  it("rejects month 00", () => {
    expect(() => dhakaDayBounds("2026-00-10")).toThrow("Date ta thik na");
  });

  it("rejects day 00", () => {
    expect(() => dhakaDayBounds("2026-01-00")).toThrow("Date ta thik na");
  });

  it("rejects an all-zero date", () => {
    expect(() => dhakaDayBounds("0000-00-00")).toThrow("Date ta thik na");
  });

  it("accepts a real leap day", () => {
    // 2024 is a leap year, so Feb 29 is a genuine calendar day and must
    // not be rejected.
    const { start } = dhakaDayBounds("2024-02-29");
    expect(start.toISOString()).toBe("2024-02-28T18:00:00.000Z");
  });
});

describe("dhakaRangeBounds", () => {
  it("covers both end days completely", () => {
    const { start, end } = dhakaRangeBounds("2026-07-01", "2026-07-31");
    expect(start.toISOString()).toBe("2026-06-30T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T18:00:00.000Z");
  });

  it("handles a single-day range", () => {
    const { start, end } = dhakaRangeBounds("2026-07-17", "2026-07-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("rejects a reversed range", () => {
    expect(() => dhakaRangeBounds("2026-07-31", "2026-07-01")).toThrow(
      "Sesh date ta shuru date er age hote parbe na",
    );
  });
});

describe("formatDhakaDate", () => {
  it("formats a UTC instant as its Dhaka calendar date", () => {
    expect(formatDhakaDate(new Date("2026-07-16T22:30:00Z"))).toBe("17/07/2026");
  });

  it("accepts an ISO string", () => {
    expect(formatDhakaDate("2026-07-16T22:30:00Z")).toBe("17/07/2026");
  });
});

describe("formatDhakaDateTime", () => {
  it("includes the Dhaka wall-clock time", () => {
    // 16:30 UTC is 22:30 in Dhaka.
    expect(formatDhakaDateTime(new Date("2026-07-17T16:30:00Z"))).toBe(
      "17/07/2026, 22:30",
    );
  });
});
