# Medicine pricing model redesign — design

Date: 2026-07-31

Covers the owner's request for purchasing cost plus separate wholesale and
khuchra (retail) rates: the Medicine schema's pricing fields, the medicine
add/edit form, and every place a rate is read — retail sales, wholesale
sales, and the buyer order flow (browse, submit, admin approval). These
were initially going to split into two specs (medicine pricing, then buyer
pata-ordering as a follow-up), but research turned up that the buyer order
flow (`Order` model, `BuyerBrowse.tsx`, `submitOrder`, `approveOrder`)
already carries `boxes` *and* `patas` per line end to end — it just prices
the patas by prorating the box rate (`wholesaleLineTotal`), the same
proration this spec removes from the wholesale sale form. Fixing that
proration is one change, not two, so both are covered here.

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
5. The buyer order flow already collects `boxes` *and* `patas` per line
   (`Order.orderLineSchema`, `BuyerBrowse.tsx`) but only ever snapshots and
   bills the box rate: `OrderEditor.tsx` hardcodes `patas: 0` when it loads
   a pending order for editing, and `PendingOrders.tsx`'s one-click approve
   never sends `patas` to `approveOrder` at all. A buyer who orders loose
   patas today has them silently dropped from the invoice at approval time.

The owner wants four independent, explicit selling rates (wholesale box,
wholesale pata, khuchra box, khuchra pata) plus a purchasing cost, with each
channel's rate used only by that channel — no more proration standing in
for a rate nobody set, and no more dropped patas in the buyer-order path.

## Scope

- `src/models/Medicine.ts` — pricing fields
- `src/components/MedicineForm.tsx` — add/edit form
- `src/actions/medicines.ts` — `MedicineInput`, validation, `toFields()`
- `src/lib/saleTotals.ts`, `src/lib/writeWholesaleSale.ts` — wholesale line
  pricing (drops proration, uses explicit wholesale pata rate)
- `src/actions/sales.ts` (`recordRetailSale`), `src/components/RetailSaleForm.tsx`,
  `src/components/MedicinePicker.tsx` — retail sale gains box selling
- `src/components/WholesaleSaleForm.tsx` — cart total math update
- `src/models/Order.ts` — order line snapshots both wholesale rates
- `src/actions/buyerOrders.ts` (`searchMedicinesForBuyer`, `submitOrder`,
  `submitShortlist`) — buyer sees and orders against both wholesale rates
- `src/components/BuyerBrowse.tsx`, `src/components/BuyerOrderList.tsx`,
  `src/app/(buyer)/buyer/orders/page.tsx` — buyer-facing cart/list totals
  drop proration, same split as the wholesale form
- `src/actions/adminOrders.ts` (`currentBoxPrices` → `currentWholesalePrices`,
  `approveOrder`/`validateApproval`) — admin sees/approves both rates
- `src/components/OrderEditor.tsx`, `src/components/PendingOrders.tsx`,
  `src/app/(admin)/orders/[id]/edit/page.tsx` — order approval actually
  bills the patas a buyer ordered, not just the boxes
- `src/components/MedicineTable.tsx`, `src/app/(admin)/medicines/page.tsx` —
  renamed field references
- A one-off migration script for existing Atlas data (`Medicine` documents
  and any `Order` documents' line items)

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

### 6. Buyer order flow: snapshot and bill both wholesale rates

`Order.orderLineSchema` gains `wholesalePataPricePaisa` (required, `min: 0`)
alongside the renamed `wholesaleBoxPricePaisa`, mirroring the sale line's
snapshot pattern. A line's total is the same plain split used everywhere
else: `boxes * wholesaleBoxPricePaisa + patas * wholesalePataPricePaisa`.

- `searchMedicinesForBuyer` (`buyerOrders.ts`) projects
  `wholesalePataPricePaisa` in addition to `wholesaleBoxPricePaisa` —
  this is a wholesale-buyer-facing rate the buyer is meant to see, unlike
  the khuchra rates, which stay hidden (same rule as today, just extended
  to the second wholesale field).
- `submitOrder` snapshots both rates from the medicine onto the order line,
  same as it snapshots `wholesaleBoxPricePaisa` today.
- `submitShortlist` (custom/free-text lines with no catalog match) sets
  both rates to `0`, same as it does for `boxPricePaisa` today — the admin
  fills in a real price during approval.
- `BuyerBrowse.tsx`'s cart total drops `wholesaleLineTotal` for the plain
  split, reading `medicine.wholesalePataPricePaisa` off the (now expanded)
  `BuyerMedicineOption`.
- `BuyerOrderList.tsx` / `buyer/orders/page.tsx`: `OrderRow` gains `patas`
  and `wholesalePataPricePaisa` per item; the per-item and total display
  add the patas leg.
- `adminOrders.ts`'s `currentBoxPrices` is renamed `currentWholesalePrices`
  and returns `Record<string, { boxPricePaisa: number; pataPricePaisa: number }>`
  (reads `wholesaleBoxPricePaisa`/`wholesalePataPricePaisa`) instead of a
  bare number, so the order-edit screen can show/re-price both legs at
  today's rate.
- `OrderEditor.tsx`: stops hardcoding `patas: 0` when it loads a pending
  order — it now initializes each line's `patas` from `order.items[].patas`
  and its pata rate from `currentWholesalePrices` (falling back to the
  order's own `wholesalePataPricePaisa` snapshot, same fallback rule the
  box rate already has). A pata-quantity input is added next to the
  existing box-quantity input per line (catalog items only — custom items
  stay box-only, matching `writeWholesaleSale`'s existing custom-item
  handling, which never reads patas for a custom line). The subtotal sums
  both legs per line instead of boxes only.
- `PendingOrders.tsx`'s one-click approve now includes `patas: item.patas`
  in the items it sends to `approveOrder`, and its preview total sums both
  legs — today it silently bills boxes only and drops any patas the buyer
  ordered.
- `adminOrders.ts`'s `ApprovalItemInput`/`validateApproval` already accept
  `patas` for catalog items; no change needed there beyond the rename.

### 7. Migration

A one-off script run against Atlas (not a Mongoose default, since it must
touch every existing document once):

**`medicines` collection**, per document:

```
wholesaleBoxPricePaisa   = boxPricePaisa                          // rename
retailPataPricePaisa     = pataPricePaisa                         // rename
wholesalePataPricePaisa  = round(boxPricePaisa / patasPerBox)
retailBoxPricePaisa      = pataPricePaisa * patasPerBox
purchasePricePaisa       = 0   // no historical cost data exists
```

Then `$unset` the old `boxPricePaisa`/`pataPricePaisa` fields.

**`orders` collection**, per document, for every line in `items[]`:

```
items[].wholesaleBoxPricePaisa  = items[].boxPricePaisa            // rename
items[].wholesalePataPricePaisa = 0   // no wholesale pata rate existed when these orders were placed
```

Then `$unset` `items[].boxPricePaisa`. Every order (any status) is
migrated, not just pending ones, so historical orders keep reading
correctly under the renamed field. A pata rate of `0` for pre-migration
orders is honest: no such rate existed when they were placed, and any
`patas` already on those lines were being billed as free (see Problem #5)
— this migration does not retroactively invent a charge for them.

Run once, by hand, against the live Atlas database as part of shipping
this change — not an app-startup migration.

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

**Buyer order with loose patas:** a wholesale buyer browses the catalog,
sees a medicine at `wholesaleBoxPricePaisa: 50000` /
`wholesalePataPricePaisa: 5200`, and orders 4 boxes + 6 patas. The order
line snapshots both rates; the owner opens the order to approve it, sees
"4 box, 6 pata" with a pata quantity input pre-filled from the order (not
0), and the preview and resulting sale both total
`4 * 50000 + 6 * 5200 = 231200` paisa.

## Error handling

| Condition | Result |
| --- | --- |
| Any of the 4 required rate fields missing/non-integer/negative on medicine create or update | Rejected with the existing "thik nai" validation message pattern |
| `mrpBoxPricePaisa` set below `wholesaleBoxPricePaisa` | Rejected: "MRP pack rate er cheye kom hote parbe na" |
| `purchasePricePaisa` omitted | Defaults to `0`, same as MRP today |
| `form === "other"` | Box/pata rate pairs forced equal at the form layer, same as today |
| Retail sale line with `boxes: 0, patas: 0` | Rejected — same zero-quantity-line guard retail already has |
| Buyer order line with `boxes: 0, patas: 0` | Rejected — same guard `validateItems` already has in `buyerOrders.ts` |
| One-click approve on an order containing a custom (non-catalog) item | Blocked, same as today — `PendingOrders.tsx` still redirects to the edit screen for pricing |

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
- `buyerOrders.test.ts` — `submitOrder` snapshots both wholesale rates onto
  a line; `submitShortlist` sets both to 0; `searchMedicinesForBuyer`
  returns `wholesalePataPricePaisa` and still omits both khuchra rates
- `adminOrders.test.ts` — `currentWholesalePrices` returns both rates;
  `approveOrder` bills a line's patas at `wholesalePataPricePaisa`, not 0
  or a prorated box fraction
- `Order.test.ts` — schema accepts `wholesalePataPricePaisa`
- Migration script — dry-run against a copy of representative data
  (`medicines` and `orders` collections), verifying the rename/derive/
  default math above before running against live Atlas

## Verification

Checked in a browser before this is called done: add a new medicine with
all 5 rates filled in and confirm it saves; edit an existing (migrated)
medicine and confirm the derived wholesale-pata and khuchra-box rates
appear as expected starting values; run a mixed wholesale sale (boxes +
loose patas) from the admin wholesale form and check the invoice total
against the two-rate formula by hand; run a retail sale with both a box
line and a pata line and check the same; confirm an "other"-form medicine
(e.g. a syrup) still shows one rate input per channel; as a buyer, browse
the catalog and order a medicine with both boxes and loose patas, then as
the owner open that order for approval and confirm the patas show up
(not silently dropped) and price correctly, both via the edit screen and
via one-click approve on a patas-only catalog order.
