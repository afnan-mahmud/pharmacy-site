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
  // Even if stock is negative or 0, we show it as low stock and allow ordering
  if (stockPatas <= 0) return "low";
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
