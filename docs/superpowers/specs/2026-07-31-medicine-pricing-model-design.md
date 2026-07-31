# Medicine pricing model redesign — design

Date: 2026-07-31

Part of a larger owner request (purchasing cost + separate wholesale/khuchra
rates) split into two independent sub-projects. This spec covers the first
and foundational slice: the Medicine schema's pricing fields, the medicine
add/edit form, and how retail and wholesale sales price a line. A follow-up
spec (not yet written) covers letting buyers order pata-wise in the buyer
portal, which depends on the `wholesalePataPricePaisa` field this spec adds.

## Problem

`Medicine` today has two selling-price fields doing double duty:

1. `boxPricePaisa` is used exclusively by wholesale sales (`writeWholesaleSale`)
   but the admin form labels it "wholesale" even though nothing stops it
   from also representing a retail box price — retail just never sells
   boxes today.
2. `pataPricePaisa` is used exclusively by retail sales — there is no
   wholesale per-pata rate, so a mixed wholesale sale (10 boxes + 3 loose
   patas) prices the 3 leftover patas as a prorated fraction of the box
   rate (`wholesaleLineTotal` in `src/lib/saleTotals.ts`), not a rate the
   owner actually sets.
3. There is no purchasing/cost price anywhere — not on `Medicine`, not on
   `StockEntry` — so margin can never be computed from stored data.
4. Retail sales cannot sell by box at all; `RetailSaleInput.items` is
   `{ medicineId, patas }[]`.

The owner wants four independent, explicit selling rates (wholesale box,
wholesale pata, khuchra box, khuchra pata) plus a purchasing cost, with each
channel's rate used only by that channel — no more proration standing in
for a rate nobody set.

## Scope

- `src/models/Medicine.ts` — pricing fields
- `src/components/MedicineForm.tsx` — add/edit form
- `src/actions/medicines.ts` — `MedicineInput`, validation, `toFields()`
- `src/lib/saleTotals.ts`, `src/lib/writeWholesaleSale.ts` — wholesale line
  pricing (drops proration, uses explicit wholesale pata rate)
- `src/actions/sales.ts` (`recordRetailSale`), `src/components/RetailSaleForm.tsx`,
  `src/components/MedicinePicker.tsx` — retail sale gains box selling
- `src/components/WholesaleSaleForm.tsx` — cart total math update
- Every other reader of the renamed fields: `MedicineTable.tsx`,
  `medicines/page.tsx`, `src/actions/adminOrders.ts` (`currentBoxPrices`),
  `src/actions/buyerOrders.ts`, `src/models/Order.ts`, `OrderEditor.tsx`,
  `PendingOrders.tsx`, `BuyerBrowse.tsx`, `BuyerOrderList.tsx` — renamed
  field references only, no structural change (buyer ordering stays
  wholesale-box-only in this spec)
- A one-off migration script for existing Atlas data

Out of scope (queued as a separate spec): buyer portal pata-wise ordering,
which needs `Order` line items, `OrderEditor`, and the buyer cart UI to
carry both boxes and patas.

## Approach

### 1. Five pricing fields replace two

`Medicine` gains/renames (all `Number`, integer paisa):

| Field | Meaning | Required | Default |
| --- | --- | --- | --- |
| `purchasePricePaisa` | Purchasing/cost rate, per box | No | `0` |
| `wholesaleBoxPricePaisa` | Wholesale rate, per box (renamed from `boxPricePaisa`) | Yes | — |
| `wholesalePataPricePaisa` | Wholesale rate, per loose pata (**new**) | Yes | — |
| `retailBoxPricePaisa` | Khuchra rate, per box (**new**) | Yes | — |
| `retailPataPricePaisa` | Khuchra rate, per pata (renamed from `pataPricePaisa`) | Yes | — |
| `mrpBoxPricePaisa` | Unchanged field; now validated against `wholesaleBoxPricePaisa` | No | `0` |

`patasPerBox`, `stockPatas`, `lowStockThreshold`, `form`, `active` are
unchanged. The old `boxPricePaisa`/`pataPricePaisa` fields are removed from
the schema and every code reference, not kept as deprecated aliases.

`form === "other"` (no real outer pack — bottles, tubes) keeps today's
box=pata collapse rule, applied to both channels:
`wholesaleBoxPricePaisa = wholesalePataPricePaisa` and
`retailBoxPricePaisa = retailPataPricePaisa`.

### 2. Medicine form gains grouped rate sections

`MedicineForm.tsx` reorganizes its price inputs into four labeled groups
instead of three flat fields:

- **Purchase rate** — one optional input, "Purchase rate (৳) — per {outer}".
- **Wholesale rate** — two inputs: "{outer} rate (৳)" and "{inner} rate (৳)".
- **Khuchra rate** — two inputs: "{outer} rate (৳)" and "{inner} rate (৳)".
- **MRP** — unchanged position/label, now compared against the wholesale
  box rate.

For `form === "other"`, each rate pair collapses to a single input, same
pattern as today's single box=pata collapse.

Taka→paisa conversion at submit time is unchanged (`takaToPaisa()` per
field).

### 3. Validation (`src/actions/medicines.ts`)

- `purchasePricePaisa` — optional; defaults to `0`; non-negative integer
  when present (same treatment `mrpBoxPricePaisa` gets today).
- `wholesaleBoxPricePaisa`, `wholesalePataPricePaisa`, `retailBoxPricePaisa`,
  `retailPataPricePaisa` — required non-negative integers, via the existing
  `validateNonNegativeInteger` helper.
- `mrpBoxPricePaisa` — unchanged rule, now checked against
  `wholesaleBoxPricePaisa`: "MRP pack rate er cheye kom hote parbe na."
- No cross-field check between a channel's box and pata rate (matches
  today — the owner may intentionally round either).

### 4. Wholesale sale pricing drops proration

`wholesaleLineTotal()` (`src/lib/saleTotals.ts`) is removed. A wholesale
line's total becomes a plain split, computed in `writeWholesaleSale`:

```
lineTotal = boxes * medicine.wholesaleBoxPricePaisa
          + leftoverPatas * medicine.wholesalePataPricePaisa
```

Catalog items read `medicine.wholesaleBoxPricePaisa` /
`medicine.wholesalePataPricePaisa` in place of the single `boxPricePaisa`.
Custom (non-catalog) order/sale items are unchanged — still priced from
admin-entered `customPricePaisa`. `WholesaleSaleForm.tsx`'s cart total
math updates to the same split; the boxes/patas inputs it already collects
per line are unchanged.

### 5. Retail sale gains box selling

`RetailSaleInput.items` changes from `{ medicineId, patas }[]` to
`{ medicineId, boxes, patas }[]`, mirroring wholesale's item shape. Line
pricing in `recordRetailSale`:

```
lineTotal = boxes * medicine.retailBoxPricePaisa
          + patas * medicine.retailPataPricePaisa
```

No proration needed — both rates are explicit. `RetailSaleForm.tsx` /
`MedicinePicker.tsx` add a box-quantity input alongside the existing
pata-quantity input per cart line, same layout pattern
`WholesaleSaleForm.tsx` already uses. Stock deduction is unchanged in
mechanism (`applyStockDelta`), just now driven by
`boxes * patasPerBox + patas` total patas instead of `patas` alone.

### 6. Migration

A one-off script run against Atlas (not a Mongoose default, since it must
touch every existing document once):

```
wholesaleBoxPricePaisa   = boxPricePaisa                          // rename
retailPataPricePaisa     = pataPricePaisa                         // rename
wholesalePataPricePaisa  = round(boxPricePaisa / patasPerBox)
retailBoxPricePaisa      = pataPricePaisa * patasPerBox
purchasePricePaisa       = 0   // no historical cost data exists
```

Then `$unset` the old `boxPricePaisa`/`pataPricePaisa` fields. Run once,
by hand, against the live Atlas database as part of shipping this change —
not an app-startup migration.

### 7. Everything else that reads the renamed fields

Updated to the new names, no structural change: `MedicineTable.tsx`,
`medicines/page.tsx`, `adminOrders.ts`'s `currentBoxPrices` (now reads
`wholesaleBoxPricePaisa`), `buyerOrders.ts`, `Order.ts`, `OrderEditor.tsx`,
`PendingOrders.tsx`, `BuyerBrowse.tsx`, `BuyerOrderList.tsx`. Buyer-facing
ordering stays wholesale-box-only in this spec — pata ordering is the
follow-up spec.

## Data flow

**Adding a medicine:** owner fills purchase rate ৳400/box, wholesale
৳500/box + ৳52/pata, khuchra ৳550/box + ৳58/pata, MRP ৳600/box.
`createMedicine` stores all five fields as paisa integers; no relationship
between box and pata rates is enforced beyond MRP ≥ wholesale box rate.

**Mixed wholesale sale:** a buyer takes 10 boxes + 3 loose patas of a
medicine with `wholesaleBoxPricePaisa: 50000`, `wholesalePataPricePaisa: 5200`,
`patasPerBox: 10`. Line total = `10 * 50000 + 3 * 5200 = 515600` paisa —
computed directly from the two stored rates, no division or rounding step.

**Retail box sale:** a walk-in customer buys 2 full boxes and 1 loose
strip of a medicine with `retailBoxPricePaisa: 55000`,
`retailPataPricePaisa: 5800`. Line total = `2 * 55000 + 1 * 5800 = 115800`
paisa.

## Error handling

| Condition | Result |
| --- | --- |
| Any of the 4 required rate fields missing/non-integer/negative on medicine create or update | Rejected with the existing "thik nai" validation message pattern |
| `mrpBoxPricePaisa` set below `wholesaleBoxPricePaisa` | Rejected: "MRP pack rate er cheye kom hote parbe na" |
| `purchasePricePaisa` omitted | Defaults to `0`, same as MRP today |
| `form === "other"` | Box/pata rate pairs forced equal at the form layer, same as today |
| Retail sale line with `boxes: 0, patas: 0` | Rejected — same zero-quantity-line guard retail already has |

## Testing

- `medicines.test.ts` — validation for all 5 fields (required vs optional,
  non-negative integer, MRP-vs-wholesale-box rule), "other" form collapse
  for both rate pairs
- `saleTotals` — `wholesaleLineTotal` tests removed/replaced with tests for
  the new plain box+pata split formula
- `writeWholesaleSale.test.ts` — catalog line pricing reads the two
  wholesale rates directly (no proration); custom items unchanged
- `sales.test.ts` — `recordRetailSale` with boxes-only, patas-only, and
  mixed lines, each priced from the two khuchra rates
- `Order.test.ts`, `adminOrders`/`buyerOrders` tests — renamed field
  references updated, no behavior change asserted
- Migration script — dry-run against a copy of representative data,
  verifying the rename/derive/default math above before running against
  live Atlas

## Verification

Checked in a browser before this is called done: add a new medicine with
all 5 rates filled in and confirm it saves; edit an existing (migrated)
medicine and confirm the derived wholesale-pata and khuchra-box rates
appear as expected starting values; run a mixed wholesale sale (boxes +
loose patas) and check the invoice total against the two-rate formula by
hand; run a retail sale with both a box line and a pata line and check the
same; confirm an "other"-form medicine (e.g. a syrup) still shows one rate
input per channel.
