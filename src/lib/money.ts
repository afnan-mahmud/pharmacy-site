/**
 * Money is stored as integer paisa throughout the system. 1 taka = 100 paisa.
 * This module is the only place taka and paisa convert.
 */

export function takaToPaisa(taka: string | number): number {
  const value = typeof taka === "string" ? Number(taka.trim()) : taka;

  if (typeof taka === "string" && taka.trim() === "") {
    throw new Error("Amount is not a valid amount");
  }
  if (!Number.isFinite(value)) {
    throw new Error("Amount is not a valid amount");
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
  const formatted = (paisa / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `৳${formatted}`;
}
