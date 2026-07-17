/**
 * Money is stored as integer paisa throughout the system. 1 taka = 100 paisa.
 * This module is the only place taka and paisa convert.
 */

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

export function takaToPaisa(taka: string | number): number {
  const trimmed = typeof taka === "string" ? taka.trim() : undefined;
  const value = typeof taka === "string" ? Number(trimmed) : taka;

  if (typeof taka === "string" && !PLAIN_DECIMAL.test(trimmed as string)) {
    throw new Error("Amount is not a valid number");
  }
  if (!Number.isFinite(value)) {
    throw new Error("Amount is not a valid number");
  }
  if (value < 0) {
    throw new Error("Amount cannot be negative");
  }

  // Round after scaling: 1.005 * 100 is 100.49999... in binary floating point,
  // so a bare Math.round on the product would give 100 instead of 101.
  return Math.round(Number((value * 100).toFixed(4)));
}

export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}

export function formatTaka(paisa: number): string {
  // Format the magnitude and place the sign in front of the currency
  // symbol: "-৳12.50", not "৳-12.50". The latter reads as a taka amount of
  // "-12.50" glued onto the symbol; the former reads as a negative amount
  // of money, which is what a negative balance (buyer credit — see
  // src/actions/due.ts) actually means.
  const sign = paisa < 0 ? "-" : "";
  const formatted = (Math.abs(paisa) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}৳${formatted}`;
}
