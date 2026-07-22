# Medicine forms and unit labels — design

Date: 2026-07-22

## Problem

Every medicine in the system is described with the same two words: **box** and
**pata**. That reads correctly for a tablet or capsule strip and wrongly for
everything else. Adding a syrup asks the owner "1 box e koto pata" when the real
question is "1 carton e koto bottle". The same wrong wording then follows the
product through the medicine table, the stock-in form, both sale forms, the
low-stock list, the order screens, the buyer storefront and the printed invoice.

The underlying structure is not wrong. A syrup carton holding twelve bottles is
the same shape as a box holding ten patas: an outer pack, an inner unit, and an
integer conversion between them. Wholesale moves outer packs, retail moves inner
units. Only the words are wrong.

## Scope

Wording only. No change to how stock is counted, how prices are stored, or how
any total is computed.

Out of scope: single-tier products (a medicine sold only as loose bottles with
no outer pack), free-text unit names, and renaming the internal database fields.

## Approach

Add one field to `Medicine` — `form` — and derive every user-visible unit word
from it. The canonical stock number and all money fields keep their current
names and meanings.

### The forms

| `form` | Shown as | Outer | Inner | Invoice short |
| --- | --- | --- | --- | --- |
| `tablet` | Tablet / Capsule | box | pata | bx / pt |
| `syrup` | Syrup / Suspension | carton | bottle | ctn / btl |
| `injection` | Injection / Vial | box | vial | bx / vl |
| `cream` | Cream / Ointment | box | tube | bx / tb |
| `drops` | Drops / Inhaler | box | piece | bx / pc |

`tablet` is the default, which is what every existing medicine is.

### Field naming stays put

`stockPatas`, `patasPerBox`, `pataPricePaisa` and `boxPricePaisa` keep their
names. They are internal names for "inner units in stock", "inner units per
outer pack", "price of one inner unit" and "price of one outer pack" — meanings
that hold for every form. Renaming them would mean a database migration and
edits across twenty-odd files and their tests, for a change that alters no
behaviour. The existing doc comment on `src/lib/units.ts` is updated to say this
explicitly so the next reader is not misled by the word "pata".

### No migration, and why the fallback matters

Existing medicine documents have no `form` field. Mongoose applies schema
defaults when it instantiates a document, but the read paths in this codebase
use `.lean()`, which returns raw BSON — a missing `form` arrives as `undefined`,
not as `"tablet"`.

Rather than backfilling the collection, `unitLabelsFor()` treats `undefined` and
any unrecognised value as `tablet`. That makes legacy documents correct by
definition, and means a future form value that reaches an old client renders
plain wording instead of crashing a page.

## Components

### `src/lib/unitLabels.ts` (new)

The single place any unit word comes from.

```ts
export const MEDICINE_FORMS = ["tablet", "syrup", "injection", "cream", "drops"] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];

export type UnitLabels = {
  formLabel: string;   // "Syrup / Suspension" — for the form picker
  outer: string;       // "carton"
  inner: string;       // "bottle"
  outerShort: string;  // "ctn" — 80mm invoice paper
  innerShort: string;  // "btl"
};

export function unitLabelsFor(form: unknown): UnitLabels;
export function isMedicineForm(value: unknown): value is MedicineForm;
```

`unitLabelsFor` accepts `unknown` deliberately: its callers include lean query
results and snapshotted sale lines, where the value is not statically known to
be a valid form.

Labels are stored lowercase. Screens that need a capital first letter apply it
at the call site, so the table stays the one description of each form.

### `src/lib/units.ts` (changed)

`formatStock(stockPatas, patasPerBox)` gains a required third parameter:

```ts
formatStock(stockPatas: number, patasPerBox: number, form: unknown): string
```

Required rather than defaulted, so the compiler names every call site instead of
letting one quietly keep saying "pata". `boxesToPatas` and `splitStock` are pure
arithmetic and are untouched.

### `src/models/Medicine.ts` (changed)

```ts
form: { type: String, enum: MEDICINE_FORMS, required: true, default: "tablet" },
```

### `src/models/Sale.ts` and `src/models/Order.ts` (changed)

Each line schema gains `form: { type: String, default: "tablet" }`.

The line stores the **form**, not a rendered label, because the invoice needs
`"btl"` while the order screen needs `"bottle"` — both are derivable from the
form, neither is derivable from the other. It follows the denormalisation
already documented in both schemas: `medicineName` and the snapshotted prices
exist so a past invoice reads correctly after the medicine changes, and the unit
wording needs the same protection. Legacy lines have no `form` and fall back to
tablet wording, which is what they were printed with.

`Sale.items[].unit` keeps its `"box" | "pata"` enum. It is a tier marker telling
stock arithmetic which tier was sold, not a display string, and it is not
renamed.

### `src/actions/medicines.ts` (changed)

`MedicineInput` gains an optional `form`. `validate()` rejects any value that is
not in `MEDICINE_FORMS`; `undefined` resolves to `"tablet"` so existing callers
and tests keep working. Both `createMedicine` and `updateMedicine` write it.

Changing a medicine's form on edit is allowed. It renames words and touches no
number: `stockPatas` counts inner units under any form, so the stored value
stays meaningful.

### Read paths that must carry `form`

`form` has to reach every screen that prints a unit word:

- `src/app/(admin)/medicines/page.tsx` — into the row mapping
- `src/actions/dashboard.ts` — onto `LowStockRow`
- `src/components/MedicinePicker.tsx` — onto the picked medicine, so the retail
  and wholesale sale forms have it
- `src/actions/buyerOrders.ts` — added to the `.select()` and the returned shape

Sending `form` to a buyer is safe. The domain rule that `searchMedicinesForBuyer`
enforces is that a buyer never sees the raw stock count or the retail (pata)
price. A form name is neither.

### Screens updated

`MedicineForm`, `MedicineTable`, `StockInForm`, `MedicinePicker`,
`RetailSaleForm`, `WholesaleSaleForm`, `DashboardCards`, `PendingOrders`,
`BuyerBrowse`, `BuyerOrderList`, `Invoice`, and the stock-entry table in
`src/app/(admin)/stock/page.tsx`.

`MedicineForm` gains a form picker as its first field. Changing it relabels the
pack fields live — "1 box e koto pata" becomes "1 carton e koto bottle", "Pata
rate (৳) — khuchra" becomes "Bottle rate (৳) — khuchra", and so on. New
medicines default to tablet.

## Data flow

Adding a syrup: the owner picks `syrup` in `MedicineForm`, whose labels
immediately read carton/bottle. `createMedicine` validates the form and stores
it alongside `patasPerBox: 12` — twelve bottles per carton, in a field still
named for patas. Stock-in adds cartons; `boxesToPatas` converts to 120 inner
units in `stockPatas`. `formatStock(120, 12, "syrup")` renders "10 carton". A
wholesale sale of two cartons writes a sale line with `unit: "box"`,
`form: "syrup"`, `patasDeducted: 24`; the invoice prints "2ctn".

## Error handling

Bad `form` from the network is rejected at the action boundary, alongside the
existing integer checks. Bad or missing `form` on the read side is never an
error — it falls back to tablet wording. That asymmetry is deliberate: writes are
a trust boundary, reads must not be able to break a page over a cosmetic field.

## Testing

- `tests/lib/unitLabels.test.ts` (new) — each form's labels; `undefined`,
  `null`, `""` and an unknown string all fall back to tablet; every value in
  `MEDICINE_FORMS` has an entry.
- `tests/lib/units.test.ts` — `formatStock` renders per form, including the
  mixed "3 carton 5 bottle" case and the legacy `undefined` form.
- `tests/actions/medicines.test.ts` — a valid form round-trips; an unknown form
  is rejected; an omitted form stores `"tablet"`; an edit can change the form
  without changing `stockPatas`.

The full suite (`npm test`) must pass, since `formatStock`'s new required
parameter touches existing call sites.

## What this does not do

It does not support a medicine with no outer pack. Such a product is entered
with `patasPerBox: 1`, which makes outer and inner the same thing and displays
correctly, but the form still shows both pack fields. If that turns out to
matter, it is a separate change.
