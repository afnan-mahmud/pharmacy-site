/**
 * Page sizes and page-number handling, shared by every list that reads more
 * rows than a screen can show.
 *
 * Lives in lib rather than beside the actions because src/actions modules are
 * "use server" files, where every export must be an async function — a plain
 * constant cannot be exported from one, and the client components that render
 * the page controls need these numbers too.
 *
 * The sizes differ because the rows differ: a medicine is one line in a
 * table, a sale in the report carries its whole item list, and a ledger row
 * is read one transaction at a time.
 */

export const MEDICINE_PAGE_SIZE = 50;
export const REPORT_PAGE_SIZE = 50;
/**
 * How many of a customer's most recent ledger entries are read at once.
 *
 * A ledger is a merged stream of two collections, so it is windowed rather
 * than paged: the running balance is computed backwards from the customer's
 * current balance, which makes the newest N entries exactly correct on their
 * own but says nothing about a slice taken from the middle. The window is
 * generous enough that "load more" is rare and cheap when it happens.
 */
export const LEDGER_WINDOW = 100;
export const MAX_LEDGER_WINDOW = 1000;

/**
 * The hard ceiling on the sale picker's medicine search, whatever limit the
 * caller asks for. Separate from the page sizes above because it bounds a
 * type-ahead rather than a page: nobody scrolls to the end of a search box,
 * so this only has to be comfortably larger than the number of results a
 * person will actually look at.
 */
export const MAX_MEDICINE_SEARCH_RESULTS = 100;

/**
 * Coerces a page number arriving over the network into a usable one.
 *
 * Server Actions are directly callable POST endpoints, so `page` is not
 * bounded by what the UI would send: a fractional, negative, NaN or absurd
 * value would otherwise reach `.skip()` and either throw a raw driver error
 * or make the database walk an arbitrary distance into a collection. Anything
 * unusable becomes page 1 rather than an error, because a bad page number is
 * not something a person can act on — there is no wrong input for them to
 * correct, only a link that has gone stale.
 */
export function normalizePage(page: unknown): number {
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
    return 1;
  }
  return page;
}

/** How many pages `total` rows fill. Always at least 1, so "page 1 of 1" reads correctly when empty. */
export function pageCount(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/**
 * The rows to skip for a page, clamped so that a page past the end lands on
 * the last real page instead of returning nothing. A list that silently
 * empties itself — after a search narrows the results while the reader is on
 * page 4, say — reads as "everything is gone" rather than "you are past the
 * end".
 */
export function skipFor(page: number, pageSize: number, total: number): number {
  const lastPage = pageCount(total, pageSize);
  const clamped = Math.min(page, lastPage);
  return (clamped - 1) * pageSize;
}
