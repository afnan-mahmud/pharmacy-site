import { unitLabelsFor } from "@/lib/unitLabels";

/**
 * Stock is stored as a single integer count of inner units — patas for a
 * tablet strip, bottles for a syrup. The owner enters and reads stock in outer
 * packs, so every pack quantity converts through here. Keeping one canonical
 * number means the two counts can never disagree.
 *
 * The field names say "pata" and "box" because that is what they were called
 * when the system only sold tablets; they mean "inner unit" and "outer pack"
 * under every medicine form. The words a person actually sees come from
 * src/lib/unitLabels.ts, never from these names.
 */

function assertWholeNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not a valid number`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

function assertPatasPerBox(patasPerBox: number): void {
  if (!Number.isFinite(patasPerBox)) {
    throw new Error("patasPerBox is not a valid number");
  }
  if (!Number.isInteger(patasPerBox)) {
    throw new Error("patasPerBox must be a whole number");
  }
  if (patasPerBox < 1) {
    throw new Error("patasPerBox must be at least 1");
  }
}

export function boxesToPatas(boxes: number, patasPerBox: number): number {
  assertPatasPerBox(patasPerBox);
  assertWholeNonNegative(boxes, "boxes");
  return boxes * patasPerBox;
}

export function splitStock(
  stockPatas: number,
  patasPerBox: number,
): { boxes: number; patas: number } {
  assertPatasPerBox(patasPerBox);
  assertWholeNonNegative(stockPatas, "stockPatas");
  return {
    boxes: Math.floor(stockPatas / patasPerBox),
    patas: stockPatas % patasPerBox,
  };
}

export function formatStock(
  stockPatas: number,
  patasPerBox: number,
  form: unknown,
): string {
  // splitStock still validates (integer-ness, NaN/Infinity) and still
  // rejects a negative value — so the sign is stripped here, before the
  // call, rather than loosening splitStock's own contract for every caller.
  const negative = stockPatas < 0;
  const { boxes, patas } = splitStock(Math.abs(stockPatas), patasPerBox);
  const labels = unitLabelsFor(form);
  const sign = negative ? "-" : "";
  if (boxes === 0) return `${sign}${patas} ${labels.inner}`;
  if (patas === 0) return `${sign}${boxes} ${labels.outer}`;
  return `${sign}${boxes} ${labels.outer} ${patas} ${labels.inner}`;
}
