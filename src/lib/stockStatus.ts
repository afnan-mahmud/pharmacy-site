/**
 * A buyer-facing stock signal derived from the internal pata count.
 *
 * Wholesale buyers never see the exact quantity (that is the owner's
 * business) — only whether a medicine is available, running low, or out. This
 * turns the precise `stockPatas` into that three-way signal so the number
 * itself never leaves the server.
 *
 * - "out"  — nothing in stock
 * - "low"  — at or below the owner's own low-stock alert level (but not empty)
 * - "in"   — comfortably in stock
 *
 * A `lowStockThreshold` of 0 means the owner set no alert for this medicine,
 * so anything above empty reads as simply "in".
 */
export type StockStatus = "in" | "low" | "out";

export function stockStatus(
  stockPatas: number,
  lowStockThreshold: number,
): StockStatus {
  // Nothing on the shelf reads as "out", including the negative stock a sale
  // is allowed to leave behind (see src/lib/stockTransaction.ts). This used
  // to return "low" here, which made the "out" branch — and the "Out of
  // Stock" label that goes with it — unreachable: a buyer saw "Low Stock"
  // against a medicine there were minus twenty-five patas of.
  //
  // Saying so does not stop them ordering it. The buyer portal treats this
  // as a label, not a gate, so an out-of-stock line is still a request the
  // owner can fill from the next delivery — which was the intent behind the
  // old behaviour, just achieved by mislabelling instead.
  if (stockPatas <= 0) return "out";
  if (lowStockThreshold > 0 && stockPatas <= lowStockThreshold) return "low";
  return "in";
}

/** The label shown to a buyer for each status. */
export function stockStatusLabel(status: StockStatus): string {
  switch (status) {
    case "in":
      return "In Stock";
    case "low":
      return "Low Stock";
    case "out":
      return "Out of Stock";
  }
}
