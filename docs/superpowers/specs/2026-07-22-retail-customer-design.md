# Retail customer on a counter sale — design

Date: 2026-07-22

Branch note: stacks on `feat/percent-discount` → `feat/buyer-search` →
`feat/zero-quantity-lines` → `feat/medicine-forms`. None is merged into `main`.

## Problem

A retail sale records what was sold and for how much, but not to whom. The
owner cannot look at a day's takings and tell that Karim bought ৳500 worth this
afternoon and again this morning — every counter sale is anonymous.

The sales report already has an "Invoice / Buyer" column and already renders
`row.buyerName` when it is set (`ReportView.tsx`). Retail sales never set it:
`recordRetailSale` omits the field entirely and the schema defaults it to `""`.
So most of the display side already exists and is sitting empty.

## Scope

The retail counter — `RetailSaleForm`, `recordRetailSale` — and the sales
report that reads the result.

Out of scope: a customer-wise total screen (the owner chose per-sale rows over
an aggregate), phone-number format validation, and any customer entity of its
own. A retail customer is a name and a phone written on a sale, not a record
that exists between sales.

## Approach

### Data

`Sale` gains `buyerPhone: { type: String, default: "", trim: true }`.
`buyerName` already exists and simply starts being populated for retail.

`buyerPhone` is also filled for **wholesale** sales, copied from the buyer
document in `writeWholesaleSale`. A field on `Sale` named `buyerPhone` that only
ever holds a value for one of the two sale types would be a trap for the next
reader; one line keeps the name honest.

No format validation on the phone. `Buyer.phone` is `required, unique, trim`
with no pattern check, and this follows the same convention rather than
inventing a stricter rule for the looser case.

### Index

```ts
saleSchema.index(
  { buyerPhone: 1, createdAt: -1 },
  { partialFilterExpression: { buyerPhone: { $gt: "" } } },
);
```

Partial on purpose. Every sale made before this change, and every future one
where the customer declines to give a number, carries `buyerPhone: ""`. A plain
index would pile all of them onto the single `""` key — a huge, useless entry
that the lookup would never read. Filtering the index to non-empty values keeps
it to the rows the lookup actually searches. `Sale` already uses a partial index
for `invoiceNo` for a closely related reason, so the shape is familiar here.

### Server

`RetailSaleInput` gains:

```ts
customerName: string;   // required; rejected if empty after trimming
customerPhone?: string; // optional
```

`validateRetail` rejects a name that is missing, not a string, or empty after
trimming, with `"Customer nam likhte hobe"`. The phone is accepted as absent,
`null`, or a string — coerced to `""` — and anything else is rejected, matching
how `toOptionalString` treats optional strings in `src/actions/medicines.ts`.
Both are stored trimmed.

Making the name required is a deliberate change to an existing flow: the
counter currently takes no customer information at all, and after this it cannot
complete a sale without a name. That is what the owner asked for, with the cost
understood.

### The lookup

A new action in `src/actions/sales.ts`:

```ts
export async function lookupRetailCustomer(
  phone: string,
): Promise<{ name: string } | null>;
```

It returns the `buyerName` of the most recent **retail** sale carrying that
phone, or `null`. Wholesale sales are excluded from the search: a wholesale
buyer is a managed record with its own screen, and letting a shop's name
autofill the walk-in counter would be wrong. A blank or whitespace-only phone
returns `null` without touching the database. Admin-only, like every other
action in the file.

### Autofill behaviour

Typing a phone triggers the lookup, debounced 250ms — the same treatment
`MedicinePicker` gives its type-ahead, and for the same reason.

On a hit, the name field is **overwritten** with the stored name and a small
`ager naam` note appears beside it, so the owner can see why the text changed
rather than wondering. The field stays editable, and whatever it holds at
submit is what the sale stores.

The consequence, accepted deliberately: an owner who types the name first and
the phone second will see their typing replaced. That is the rule the owner
asked for — one phone, one remembered name — and it is survivable precisely
because the field can still be edited afterwards.

### Report

`SalesReportRow` gains `buyerPhone`. A retail row renders the name and, when
present, the phone after it — `Karim Uddin · 01711111111`.

Retail sales made before this change have `buyerName: ""` and cannot be
backfilled, so the report renders those as a muted `(naam nai)`. The report has
to handle them for as long as they are in range.

## Data flow

The owner rings up ৳500 of medicine, types `01711111111` into Phone. After
250ms `lookupRetailCustomer` finds the most recent retail sale on that number
and fills Name with `Karim Uddin`, marked `ager naam`. The owner confirms.
`recordRetailSale` validates the name, and writes the sale with
`buyerName: "Karim Uddin"`, `buyerPhone: "01711111111"`, `buyerId: null` as
before. The day's report lists the sale as `Khuchra · Karim Uddin ·
01711111111 · ৳500.00`, and the retail total is unaffected — nothing about the
money changed.

## Error handling

| Condition | Result |
| --- | --- |
| Name missing or blank | `"Customer nam likhte hobe"` from the action; the form disables submit and says so before sending |
| Phone a non-string, non-null value | `"customerPhone must be a string"` |
| Lookup finds nothing | Name left as the owner typed it; no error, no note |
| Lookup itself fails | The failure is swallowed and the field left alone — a broken convenience must not block a counter sale |

That last row is the one worth stating: the autofill is a convenience, and its
failure mode is "you type the name yourself", never "you cannot sell".

## Testing

`tests/actions/sales.test.ts`:

- a retail sale stores the customer name and phone
- both are trimmed
- an absent, blank, or whitespace-only name is rejected
- the phone is optional — a sale with a name and no phone succeeds and stores `""`
- a non-string phone is rejected
- the money and stock behaviour of a retail sale is unchanged by any of this

New tests for `lookupRetailCustomer`:

- returns the name from the most recent retail sale on that phone
- returns `null` for a phone never seen
- returns `null` for a blank phone
- ignores wholesale sales, even when a wholesale buyer has that phone
- rejects a non-admin caller

Every existing test that calls `recordRetailSale({ items })` gains a
`customerName`; there are many and the change is mechanical, but each is checked
rather than swept, after a blanket rename in the percentage-discount work
silently edited an assertion it should not have touched.

## Verification

Checked in a browser before this is called done — tests and a build have twice
now passed while the feature was broken in the page. A counter sale with a name
and phone, a second sale where typing the phone fills the name, and the report
showing both.
