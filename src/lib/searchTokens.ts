/**
 * Word tokens for medicine search, and the query that matches them.
 *
 * The problem this replaces: every medicine search was
 * `{ $regex: term, $options: "i" }`, unanchored. MongoDB cannot use an index
 * for an unanchored case-insensitive regex, so each keystroke in the picker
 * scanned the whole collection — and the picker fires on every keystroke.
 *
 * The obvious fix, an anchored `^prefix` regex against the existing
 * lowercased `nameLower`, does use the index but only matches from the start
 * of the whole name: "500" would stop finding "Napa 500mg", and nothing would
 * match on a generic name any more. That is a search the owner would notice
 * getting worse.
 *
 * So the name, generic name and company are split into words once, at write
 * time, into a multikey-indexed array. A query is split the same way and each
 * of its words has to prefix-match some token. "nap" finds Napa, "500" finds
 * Napa 500mg, "para" finds anything paracetamol, and "napa 500" finds only
 * the ones matching both — all served from the index.
 *
 * What is given up is mid-word matching: "eta" no longer finds
 * "Paracetamol". No product search anywhere works that way, and it is what
 * made the query unindexable in the first place.
 */

/**
 * Everything that is not a letter or a digit is a word boundary, so brand
 * names, strengths and units all fall out as their own tokens regardless of
 * the punctuation between them: "Napa-500mg" and "Napa 500 mg" tokenize the
 * same way.
 */
const NON_WORD = /[^a-z0-9]+/;

function tokenize(value: string): string[] {
  return value.toLowerCase().split(NON_WORD).filter(Boolean);
}

/**
 * The tokens stored on a medicine. Deduplicated, since a word repeated across
 * the name and the generic name would otherwise sit in the index twice for no
 * gain.
 */
export function searchTokensFor(
  ...values: (string | null | undefined)[]
): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const token of tokenize(value)) tokens.add(token);
  }
  return [...tokens];
}

/**
 * An empty token array matches nothing, which is what a query that is all
 * punctuation has to do. Typing "..." is not the same as typing nothing: the
 * reader asked to narrow the list, so handing them the unfiltered catalogue
 * would answer a question they did not ask.
 */
const MATCHES_NOTHING = { searchTokens: { $in: [] as string[] } };

/**
 * A filter matching documents whose tokens prefix-match every word in `term`.
 *
 * Returns null only for a genuinely empty query, which callers read as "no
 * filter" — the same thing a blank search box has always meant.
 *
 * No regex escaping is needed and none is done: tokenize() keeps only
 * `[a-z0-9]`, so a token cannot contain a regex metacharacter. That is
 * stronger than the escaping it replaces, which had to be got right at every
 * call site; here a typed `.*` cannot reach the regex at all, because it
 * tokenizes away to nothing and takes the MATCHES_NOTHING branch. There is a
 * test pinning that invariant, since the safety of the query below rests on
 * it.
 */
export function tokenPrefixFilter(term: string): Record<string, unknown> | null {
  if (typeof term !== "string" || !term.trim()) return null;

  const words = tokenize(term);
  if (words.length === 0) return MATCHES_NOTHING;

  const clauses = words.map((word) => ({
    searchTokens: { $regex: `^${word}` },
  }));

  // A single clause is left unwrapped so the common case — one word typed
  // into a picker — is the plainest query the planner can be handed.
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}
