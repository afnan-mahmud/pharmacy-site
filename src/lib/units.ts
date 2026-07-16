/**
 * Stock is stored as a single integer count of patas (strips). The owner enters
 * and reads stock in boxes, so every box quantity converts through here. Keeping
 * one canonical number means box and pata counts can never disagree.
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

export function formatStock(stockPatas: number, patasPerBox: number): string {
  const { boxes, patas } = splitStock(stockPatas, patasPerBox);
  if (boxes === 0) return `${patas} pata`;
  if (patas === 0) return `${boxes} box`;
  return `${boxes} box ${patas} pata`;
}
