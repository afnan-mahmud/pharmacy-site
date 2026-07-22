/**
 * The money arithmetic for a sale, in integer paisa throughout.
 *
 * Kept free of any database or framework dependency so the rules that decide
 * what a customer owes can be tested on their own, and so the retail and
 * wholesale actions cannot drift into two different definitions of "total".
 */

export type SaleLine = {
  ratePaisa: number;
  quantity: number;
};

function assertWholeNonNegative(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

export function lineTotal(line: SaleLine): number {
  assertWholeNonNegative(line.ratePaisa, "ratePaisa");
  assertWholeNonNegative(line.quantity, "quantity");
  return line.ratePaisa * line.quantity;
}

/**
 * A discount is a percentage, not an amount — the owner thinks "10% off this
 * shop", not "৳63.10 off". Unlike every other money figure here it may be
 * fractional, so it gets its own guard instead of assertWholeNonNegative.
 */
function assertDiscountPercent(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Discount thik nai");
  }
  if (value < 0) {
    throw new Error("Discount 0 er kom hote parbe na");
  }
  if (value > 100) {
    throw new Error("Discount 100% er beshi hote parbe na");
  }
}

/**
 * Takes the discount as a percentage and returns the paisa it works out to,
 * alongside the totals.
 *
 * Returning `discountPaisa` is the point: turning a percent into an amount
 * involves a rounding step, and if the form previewed one rounding while the
 * action computed another, the screen and the invoice would disagree about
 * what the customer owes. Every caller stores what this returns rather than
 * doing the arithmetic itself, so there is only ever one answer.
 */
export function computeTotals(
  lines: SaleLine[],
  discountPercent: number,
  paidPaisa: number,
): {
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  duePaisa: number;
} {
  assertDiscountPercent(discountPercent);
  assertWholeNonNegative(paidPaisa, "paidPaisa");

  const subtotalPaisa = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  // toFixed(4) before rounding for the same reason takaToPaisa does it (see
  // src/lib/money.ts): binary floating point renders some exact products as
  // x.99999…, which a bare Math.round would take down to the wrong paisa.
  const discountPaisa = Math.round(
    Number(((subtotalPaisa * discountPercent) / 100).toFixed(4)),
  );

  // No "discount exceeds subtotal" check: a percentage capped at 100 cannot
  // produce one, so the guard that used to live here is unreachable.
  const totalPaisa = subtotalPaisa - discountPaisa;

  if (paidPaisa > totalPaisa) {
    throw new Error("Joma taka total er cheye beshi hote parbe na");
  }

  return {
    subtotalPaisa,
    discountPaisa,
    totalPaisa,
    duePaisa: totalPaisa - paidPaisa,
  };
}
