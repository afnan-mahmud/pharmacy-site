/**
 * Every date the owner sees, and every "today" the system computes, is a
 * Dhaka date — not a UTC one. Bangladesh is UTC+6 today, but the offset is
 * resolved from the runtime's tz database (via `dhakaOffsetFor`) rather than
 * hardcoded, so if DST is ever reintroduced (it ran briefly in 2009) this
 * module tracks the change instead of silently drifting a day off from the
 * cash drawer.
 *
 * This matters concretely: a sale rung up at 22:30 Dhaka time is stored as
 * 16:30 UTC the same day, but one at 00:30 Dhaka is stored as 18:30 UTC the
 * *previous* day. A report that bucketed by UTC day would scatter an
 * evening's takings across two dates and quietly disagree with the cash
 * drawer.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Bangladesh has run DST exactly once (2009, since abandoned), so the
// offset is *usually* a constant — but deriving it from the runtime's tz
// database, the same source `dhakaToday`/`formatDhakaDate` resolve through
// via Intl, keeps every function in this module agreeing about who decides
// the timezone. If DST ever returned, all four would track it together
// instead of quietly disagreeing about which day "today" is.
function dhakaOffsetFor(referenceInstant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    timeZoneName: "longOffset",
  }).formatToParts(referenceInstant);
  const zoneName = parts.find((part) => part.type === "timeZoneName")?.value;
  const match = zoneName?.match(/^GMT([+-]\d{2}:\d{2})$/);
  // Falls back to the known present-day offset. This *is* reachable: for
  // pre-1941 dates, ICU reports Dhaka's local mean time as `GMT+05:53:20`
  // (a non-integer-minute offset, with seconds), which the `\d{2}:\d{2}`
  // regex above doesn't match. Irrelevant for a pharmacy's records, but the
  // fallback is live code, not dead code.
  return match ? match[1] : "+06:00";
}

function assertDhakaDate(dhakaDate: string): void {
  const match = typeof dhakaDate === "string" ? dhakaDate.match(ISO_DATE) : null;
  if (!match) {
    throw new Error("Date ta YYYY-MM-DD hote hobe");
  }

  // The regex admits shapes like 2026-02-30 or 2026-13-01 that the calendar
  // doesn't contain. Date.parse/Date.UTC don't reject those — they
  // *normalize* them (Feb 30 becomes Mar 2), which would silently hand a
  // caller the wrong day's bounds. Round-tripping the parsed components
  // through setUTCFullYear and comparing catches any normalization: a
  // rolled-over date won't read back the same year/month/day.
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("Date ta thik na");
  }
}

/** The current Dhaka calendar date, as "YYYY-MM-DD". */
export function dhakaToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD, and asking Intl for the Dhaka zone keeps
  // this correct even if the tz database ever changes under us.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

// The UTC instant of Dhaka midnight that begins `dhakaDate`. Assumes
// `dhakaDate` is already a validated YYYY-MM-DD string.
function dhakaMidnightInstant(dhakaDate: string): Date {
  // A midday probe on this calendar date is enough to ask the tz database
  // what Dhaka's offset was that day — accurate even across a DST
  // transition, where the offset for one day differs from the next.
  const offset = dhakaOffsetFor(new Date(`${dhakaDate}T12:00:00Z`));
  return new Date(`${dhakaDate}T00:00:00.000${offset}`);
}

// The calendar date (YYYY-MM-DD) immediately following `dhakaDate`, with no
// timezone involved — this is pure calendar arithmetic. Reuses the same
// setUTCFullYear rollover `assertDhakaDate` relies on, except here the
// rollover is exactly what we want: "day after Dec 31" should become the
// next January, "day after the month's last day" the next month.
function nextCalendarDate(dhakaDate: string): string {
  const [, yearStr, monthStr, dayStr] = dhakaDate.match(ISO_DATE) as RegExpMatchArray;
  const probe = new Date(0);
  probe.setUTCFullYear(Number(yearStr), Number(monthStr) - 1, Number(dayStr) + 1);
  const year = String(probe.getUTCFullYear()).padStart(4, "0");
  const month = String(probe.getUTCMonth() + 1).padStart(2, "0");
  const day = String(probe.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The UTC instants bounding a Dhaka day: `start` inclusive, `end` exclusive.
 * Query with `{ createdAt: { $gte: start, $lt: end } }`.
 */
export function dhakaDayBounds(dhakaDate: string): { start: Date; end: Date } {
  assertDhakaDate(dhakaDate);

  // `end` is the *next* day's midnight, not `start + 24h`. A calendar day
  // is not always 24 hours long across a DST transition (Bangladesh ran
  // DST briefly in 2009): computing `end` this way makes it structurally
  // equal to the next day's `start`, so adjacent days can never overlap or
  // leave a gap, regardless of what the offset does in between.
  const start = dhakaMidnightInstant(dhakaDate);
  const end = dhakaMidnightInstant(nextCalendarDate(dhakaDate));
  return { start, end };
}

/** Start of `fromDate` to end of `toDate`, with both days included. */
export function dhakaRangeBounds(
  fromDate: string,
  toDate: string,
): { start: Date; end: Date } {
  const { start } = dhakaDayBounds(fromDate);
  const { end } = dhakaDayBounds(toDate);

  if (end.getTime() <= start.getTime()) {
    throw new Error("Sesh date ta shuru date er age hote parbe na");
  }
  return { start, end };
}

export function formatDhakaDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
  });
}

export function formatDhakaDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function parseOptionalDate(value: unknown, label = "তারিখ"): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      throw new Error(`${label} thik na`);
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      throw new Error(`${label} thik na`);
    }
    return parsed;
  }
  throw new Error(`${label} thik na`);
}

