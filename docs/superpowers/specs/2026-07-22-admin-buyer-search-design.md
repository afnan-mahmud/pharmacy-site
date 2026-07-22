# Admin buyer search — design

Date: 2026-07-22

Branch note: this stacks on `feat/zero-quantity-lines`, which stacks on
`feat/medicine-forms`. Neither is merged into `main` yet.

## Problem

The admin buyers screen lists every wholesale buyer — active and inactive — in
one unfiltered table. Finding one buyer means reading the whole list. On a phone
it is worse: the table is six columns inside an `overflow-x-auto`, so the owner
scrolls sideways through rows he cannot search.

Two things are needed: a search box, and a buyer list a phone can actually
render.

## Scope

The admin screen at `/buyers` — `src/app/(admin)/buyers/page.tsx` and
`src/components/BuyerTable.tsx`.

Out of scope: searching by address, a Chalu/Bondho filter, and server-side
search. The buyer-facing portal is untouched.

## Approach

### Filtering stays on the client

`BuyersPage` already loads every buyer and hands the whole list to `BuyerTable`
as props. Nothing has to be fetched to filter it, so the search is a plain
in-memory filter: no server action, no debounce, no loading state, and results
that appear as the owner types.

This deliberately does not copy `MedicinePicker`, which debounces a server
query. That pattern exists because the medicine catalogue is large and is not
already in the browser. A wholesale buyer list is neither. If the list ever
grows past a few hundred, this becomes the wrong shape and should be revisited.

### `src/lib/buyerSearch.ts` (new)

```ts
export type SearchableBuyer = {
  name: string;
  shopName: string;
  phone: string;
};

export function filterBuyers<T extends SearchableBuyer>(
  buyers: T[],
  query: string,
): T[];
```

Generic over the row type so the module never imports a component's types and
can be tested on its own.

The rules:

- **Empty or whitespace-only query returns the list unchanged** — including an
  empty list, which comes back empty.
- **Case-insensitive**, both sides folded with `toLowerCase()`.
- **Token-wise AND.** The query splits on whitespace, and a buyer is kept only
  if *every* token appears in at least one of the three fields. A single
  substring match against a joined string would fail on `"karim 017"` — the name
  and the phone are different fields — and on `"karim med"` if the tokens
  straddle name and shop name. Both are things the owner will type.
- **Fields searched: `name`, `shopName`, `phone`.** Address is excluded by
  decision.
- **Phone is matched as a plain substring** of the stored string. A query typed
  with dashes or spaces (`017-1111`) will not match `01711111111`. Kept simple
  on purpose; normalising digits is a later change if it turns out to matter.
- **Order is preserved** — the filter never re-sorts.

### `src/components/BuyerTable.tsx` (rewritten)

The file currently does three jobs in 106 lines: switching between the list and
the add/edit form, toggling a buyer active, and rendering the table. Adding a
search box and a second layout would mean writing every row twice, and two
copies of the row actions would eventually drift apart.

So it splits into one container and three local sub-components — local, not
separate files, because `BuyerBrowse.tsx` already keeps `ProductCard` and
`Stepper` this way and that is the established shape here:

- `BuyerTable` — owns the query, edit and toggle state; renders the heading, the
  search field, the empty states, and both layouts.
- `DesktopRows` — `hidden md:block`, the existing table.
- `MobileCards` — `md:hidden`, one card per buyer: name and status pill on the
  first line, shop name on the second, phone and address on the third, actions
  on the fourth.
- `RowActions` — the Edit and Chalu/Bondho buttons. **Both layouts render this
  same component**, so the two views cannot drift in what they do.

`md` is the breakpoint, matching the admin layout's existing `md:pb-6`.

The search field carries a clear (`×`) button whenever the query is non-empty —
on a phone, clearing a field by hand is the fiddliest thing on the screen.

### Styling

New markup uses the shared tokens in `src/components/ui.ts` (`card`, `input`,
`pageTitle`, `thead`, `th`, `td`, `trow`, `btnPrimary`, `errorBox`).
`BuyerTable` currently hand-writes its Tailwind while its sibling
`MedicineTable` already uses those tokens; since the file is being substantially
rewritten anyway, it adopts them. The visual design does not change — the same
appearance now comes from the shared tokens instead of a private copy.

## Empty states

Two distinct cases, which the current screen does not distinguish:

| Condition | Message |
| --- | --- |
| No buyers exist at all | `Kono buyer nai. Upor theke add koro.` |
| Buyers exist, none match | `"<query>" naame kono buyer pawa jay ni.` |

The second reuses the phrasing `BuyerBrowse` already uses for its no-results
case, so the two screens read the same way.

## Data flow

The owner opens `/buyers`. The server loads all buyers, including inactive ones,
and passes them down. The owner types `karim` into the search field; `BuyerTable`
holds that in state and calls `filterBuyers(buyers, query)` on each render. The
table on desktop and the cards on mobile both render the returned array. Editing
or toggling a buyer is unaffected — those act on a row's id and then
`router.refresh()`, which re-runs the server component and hands down a fresh
list. The query is component state, so a refresh leaves it in place.

## Error handling

The filter cannot fail: any query is a valid query, and no match is an empty
list, not an error. The existing `setBuyerActive` failure path — its message
rendered in `errorBox` — is unchanged.

## Testing

`tests/lib/buyerSearch.test.ts` (new):

- an empty query returns every buyer, and an empty list returns empty
- a whitespace-only query is treated as empty
- matching on each of the three fields separately
- case-insensitivity in both directions
- token-wise AND across two fields (`"karim 017"`, `"karim medical"`)
- a token that matches nothing excludes the buyer
- a partial phone match
- address is *not* searched — a query matching only the address returns nothing
- input order is preserved

No component test: every test in this repo is a `lib` or `actions` test, and
adding a component-testing setup for one screen is not part of this change.
