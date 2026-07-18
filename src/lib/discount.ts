/**
 * The whole-percent discount of a selling price against a list price (MRP),
 * for the "৳600 ~~ ৳240 · -60%~~" treatment on a product card.
 *
 * Returns 0 whenever there is nothing to show — no MRP set, an MRP at or below
 * the selling price, or bad input — so a caller can treat 0 as "render no
 * discount chip". Rounds to the nearest percent, the way a shopper reads it.
 */
export function discountPercent(
  mrpPaisa: number,
  pricePaisa: number,
): number {
  if (!Number.isFinite(mrpPaisa) || !Number.isFinite(pricePaisa)) return 0;
  if (mrpPaisa <= 0 || pricePaisa < 0) return 0;
  if (mrpPaisa <= pricePaisa) return 0;
  return Math.round(((mrpPaisa - pricePaisa) / mrpPaisa) * 100);
}
