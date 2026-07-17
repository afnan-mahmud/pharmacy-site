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

export function computeTotals(
  lines: SaleLine[],
  discountPaisa: number,
  paidPaisa: number,
): { subtotalPaisa: number; totalPaisa: number; duePaisa: number } {
  assertWholeNonNegative(discountPaisa, "discountPaisa");
  assertWholeNonNegative(paidPaisa, "paidPaisa");

  const subtotalPaisa = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  if (discountPaisa > subtotalPaisa) {
    throw new Error("Discount total er cheye beshi hote parbe na");
  }
  const totalPaisa = subtotalPaisa - discountPaisa;

  if (paidPaisa > totalPaisa) {
    throw new Error("Joma taka total er cheye beshi hote parbe na");
  }

  return { subtotalPaisa, totalPaisa, duePaisa: totalPaisa - paidPaisa };
}
