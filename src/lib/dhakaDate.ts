/**
 * Every date the owner sees, and every "today" the system computes, is a
 * Dhaka date — not a UTC one. Bangladesh is UTC+6 and does not observe DST
 * (it was tried once, in 2009, and abandoned), so the offset is a constant.
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
  // Falls back to the known present-day offset; a modern ICU build always
  // resolves this, so the fallback should never actually be exercised.
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

/**
 * The UTC instants bounding a Dhaka day: `start` inclusive, `end` exclusive.
 * Query with `{ createdAt: { $gte: start, $lt: end } }`.
 */
export function dhakaDayBounds(dhakaDate: string): { start: Date; end: Date } {
  assertDhakaDate(dhakaDate);

  // A midday probe on this calendar date is enough to ask the tz database
  // what Dhaka's offset was that day — accurate even on the (currently
  // hypothetical) day that offset changes.
  const offset = dhakaOffsetFor(new Date(`${dhakaDate}T12:00:00Z`));
  const start = new Date(`${dhakaDate}T00:00:00.000${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
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
