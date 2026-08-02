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

/**
 * A discount is either a percentage of the subtotal or a flat paisa amount —
 * never both at once. The retail counter lets the owner type into either box
 * (see RetailSaleForm); whichever one they used is what this carries.
 */
export type DiscountInput =
  | { kind: "percent"; percent: number }
  | { kind: "amount"; amountPaisa: number };

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
 * Computes a discount already expressed as a flat paisa amount. Unlike the
 * percent branch, no rounding step turns the input into discountPaisa — the
 * amount the owner typed is exactly what comes off, so the screen and the
 * invoice can never disagree by a paisa over what they entered.
 * discountPercent is derived purely for display/record; nothing recomputes
 * money from it.
 */
function amountDiscount(
  amountPaisa: number,
  subtotalPaisa: number,
): { discountPercent: number; discountPaisa: number } {
  if (typeof amountPaisa !== "number" || !Number.isInteger(amountPaisa)) {
    throw new Error("Discount thik nai");
  }
  if (amountPaisa < 0) {
    throw new Error("Discount 0 er kom hote parbe na");
  }
  if (amountPaisa > subtotalPaisa) {
    throw new Error("Discount subtotal er beshi hote parbe na");
  }
  const discountPercent =
    subtotalPaisa > 0
      ? Math.round((amountPaisa / subtotalPaisa) * 100 * 100) / 100
      : 0;
  return { discountPercent, discountPaisa: amountPaisa };
}

/**
 * Takes the discount (percent or flat amount) and returns the paisa it works
 * out to, alongside the totals.
 *
 * Returning `discountPaisa` (and, now, `discountPercent`) is the point: a
 * percent-to-paisa conversion involves a rounding step, and an amount-to-
 * percent conversion involves the reverse — if the form previewed one
 * rounding while the action computed another, the screen and the invoice
 * would disagree about what the customer owes. Every caller stores what this
 * returns rather than doing the arithmetic itself, so there is only ever one
 * answer.
 */
export function computeTotals(
  lines: SaleLine[],
  discount: DiscountInput,
  paidPaisa: number,
): {
  subtotalPaisa: number;
  discountPercent: number;
  discountPaisa: number;
  totalPaisa: number;
  duePaisa: number;
} {
  assertWholeNonNegative(paidPaisa, "paidPaisa");

  const subtotalPaisa = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  let discountPercent: number;
  let discountPaisa: number;

  if (discount.kind === "percent") {
    assertDiscountPercent(discount.percent);
    discountPercent = discount.percent;
    // toFixed(4) before rounding for the same reason takaToPaisa does it
    // (see src/lib/money.ts): binary floating point renders some exact
    // products as x.99999…, which a bare Math.round would take down to the
    // wrong paisa.
    discountPaisa = Math.round(
      Number(((subtotalPaisa * discount.percent) / 100).toFixed(4)),
    );
  } else {
    const derived = amountDiscount(discount.amountPaisa, subtotalPaisa);
    discountPercent = derived.discountPercent;
    discountPaisa = derived.discountPaisa;
  }

  const totalPaisa = subtotalPaisa - discountPaisa;

  // duePaisa may be negative when paidPaisa exceeds the total. A negative
  // value means the buyer has credit — money the pharmacy owes back. This
  // surfaces in the ledger as "Joma ache" (see src/lib/dueDisplay.ts) and is
  // automatically offset against future purchases.
  return {
    subtotalPaisa,
    discountPercent,
    discountPaisa,
    totalPaisa,
    duePaisa: totalPaisa - paidPaisa,
  };
}
