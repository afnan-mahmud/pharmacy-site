/**
 * The admin buyer list is small and already in the browser — the page hands
 * every buyer down as props — so searching it is an in-memory filter rather
 * than a debounced server query like MedicinePicker's. That pattern exists
 * because the medicine catalogue is large and not already loaded; a wholesale
 * buyer list is neither.
 */

export type SearchableBuyer = {
  name: string;
  shopName: string;
  phone: string;
};

/**
 * Keeps a buyer when *every* whitespace-separated token in the query appears
 * in at least one of the name, shop name, or phone.
 *
 * Token-wise rather than one substring over a joined string: the owner types
 * "karim 017" or "karim medical", where the tokens straddle two different
 * fields, and a single substring search would find neither.
 *
 * The address is deliberately not searched. Order is preserved.
 */
export function filterBuyers<T extends SearchableBuyer>(
  buyers: T[],
  query: string,
): T[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return buyers;

  return buyers.filter((buyer) => {
    const haystack =
      `${buyer.name} ${buyer.shopName} ${buyer.phone}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
