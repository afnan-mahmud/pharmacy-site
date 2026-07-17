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

const DHAKA_UTC_OFFSET = "+06:00";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDhakaDate(dhakaDate: string): void {
  if (typeof dhakaDate !== "string" || !ISO_DATE.test(dhakaDate)) {
    throw new Error("Date ta YYYY-MM-DD hote hobe");
  }
  // The regex admits shapes like 2026-13-01; only Date can say whether the
  // calendar actually contains that day.
  if (Number.isNaN(Date.parse(`${dhakaDate}T00:00:00${DHAKA_UTC_OFFSET}`))) {
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

  const start = new Date(`${dhakaDate}T00:00:00.000${DHAKA_UTC_OFFSET}`);
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
