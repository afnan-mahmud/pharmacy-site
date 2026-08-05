/**
 * The most line items one order or one sale may carry.
 *
 * Every write path that accepts an items array walks it one document at a
 * time — buildSaleLines does a findById plus an applyStockDelta per line, and
 * does it *inside* an open transaction; submitOrder does a findById per line;
 * validateApproval's caller does the same. None of that is wrong, but it does
 * mean the work a single request performs is set by the length of an array
 * that arrives over the network. Server Actions are directly callable POST
 * endpoints (see requireAdminAction's comment), so that length is not bounded
 * by what the UI would ever send.
 *
 * Left unbounded, a large array is a self-inflicted outage rather than a
 * validation error: thousands of sequential round trips inside one
 * transaction blow past MongoDB's transactionLifetimeLimitSeconds (60s by
 * default), hold locks while doing it, and pin a worker for the duration.
 * A cap turns that into an ordinary rejected request.
 *
 * 300 is chosen to sit well above any real order — a counter sale runs to a
 * handful of lines and even a large wholesale restock to something like 150 —
 * while still being small enough that the worst-case request stays quick. It
 * is a safety limit, not a business rule; if a genuine order ever approaches
 * it, raise the number here rather than working around it at a call site.
 */
export const MAX_LINE_ITEMS = 300;

export const TOO_MANY_LINES_ERROR = `Ek order-e sorbocho ${MAX_LINE_ITEMS} ti product deya jabe`;

/**
 * Throws the shared over-limit error when `count` exceeds the cap.
 *
 * Takes a count rather than the array itself so the merge path in
 * submitShortlist can check the size the order would *become* — an order
 * grown 5 items at a time is just as unbounded as one sent all at once, so
 * checking only the incoming request there would leave the hole open.
 */
export function assertLineCount(count: number): void {
  if (count > MAX_LINE_ITEMS) {
    throw new Error(TOO_MANY_LINES_ERROR);
  }
}
