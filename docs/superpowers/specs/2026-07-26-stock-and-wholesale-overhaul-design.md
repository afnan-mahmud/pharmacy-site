# Stock & wholesale overhaul — design

Date: 2026-07-26

Part of a larger owner request (search bars, buyer shortlist, pending-order
UX, wholesale overpayment) that was split into independent sub-projects.
This spec covers the first and most foundational slice: how stock is entered,
how a wholesale sale is priced and quantified, and what happens when a sale
outruns the stock on hand.

## Problem

Three related gaps in how stock and wholesale sales work today:

1. **Stock In is a separate page.** Restocking a medicine means leaving the
   medicine list, going to `/stock`, finding the medicine again in a picker,
   and entering how many boxes arrived. The owner wants this folded into the
   medicine's own add/edit screen — no second page to find.

2. **Wholesale sales are box-only.** `WholesaleSaleForm`'s cart line is
   `{ medicine, boxes: number }` — a buyer can only be sold whole boxes. In
   practice a wholesale buyer often takes a partial box on top of whole ones
   (10 boxes and 2 loose patas), and today there is no way to enter that
   without either rounding or a separate retail-priced line.

3. **A sale that exceeds stock is blocked.** `applyStockDelta`
   (`src/lib/stockTransaction.ts`) atomically refuses any decrement that
   would take `stockPatas` below zero, and every sale path (retail,
   wholesale, buyer order-approval) surfaces that refusal as a hard error —
   "stock e ache X, lagbe Y" — that stops the sale. The owner wants the sale
   to go through anyway: stock goes negative, and the next stock-in nets
   against the deficit.

## Scope

- `MedicineForm.tsx` and `src/actions/medicines.ts` (stock-in section)
- `src/actions/stock.ts`, `StockEntry` (unchanged model, new call site)
- `WholesaleSaleForm.tsx`, `src/lib/writeWholesaleSale.ts`,
  `src/actions/sales.ts` (wholesale validation)
- `src/lib/stockTransaction.ts` (`applyStockDelta`), `src/models/Medicine.ts`
  (`stockPatas` schema)
- `RetailSaleForm.tsx`, buyer order-approval (both lose their "insufficient
  stock" block as a side effect of the `applyStockDelta` change)
- Anywhere `formatStock`/stock numbers are rendered, for negative-stock
  styling: `MedicineTable`, `MedicinePicker`, `DashboardCards`

Out of scope (queued as separate specs): search bars (medicine/baki
khata/report pages), wholesale overpayment → buyer credit, pending-order
multi-product add, buyer shortlist.

## Approach

### 1. Stock-in moves into the medicine form

`/stock`, `StockInForm.tsx`, and the "Stock In" nav link are removed.
`MedicineForm.tsx` gains a "Stock add koro" section — a single "koto
{outer} dhuklo" (boxes) input, present in both create and edit mode —
that calls the existing `stockIn` server action (`src/actions/stock.ts`)
unchanged: same `StockEntry` audit record, same `applyStockDelta` call,
just triggered from a different screen. Below the input, the medicine's own
`StockEntry` history (`listStockEntries` filtered to this `medicineId`)
renders as a table, replacing the old page's all-medicines table.

`stockIn` already takes `{ medicineId, boxes, note }` and is admin-guarded;
no server-side change is needed here beyond a new caller.

### 2. Wholesale cart lines carry boxes *and* patas

`CartLine` becomes `{ medicine, boxes: number; patas: number }`. Each cart
row gets a second input for leftover patas alongside the existing boxes
input. Entering a patas value `>= medicine.patasPerBox` auto-carries into
boxes (12 patas at `patasPerBox: 10` becomes 1 box + 2 patas in the UI) —
the leftover figure shown is always less than a full box.

Pricing: rather than pricing the box portion and the pata portion
separately, the line is priced as a whole. Total patas for the line is
`boxes * medicine.patasPerBox + patas`; the line total is

```
round(totalPatas * medicine.boxPricePaisa / medicine.patasPerBox)
```

— one division, rounded once to the nearest paisa, not a per-pata rate
rounded first and then multiplied. This keeps the box portion's contribution
exact (`boxes * boxPricePaisa`, since `totalPatas` includes
`boxes * patasPerBox` exactly) while the leftover patas are priced as a fair
fraction of the box rate rather than the separate (and usually higher)
retail `pataPricePaisa`. `writeWholesaleSale` gets the equivalent quantity
change: `patas = boxes * medicine.patasPerBox + item.patas` (previously
`boxesToPatas(item.boxes, ...)` alone), and the stock delta and
`patasDeducted` snapshot both use this combined figure. The invoice/receipt
line displays quantity as "X box Y pata" (falling back to "X box" or
"Y pata" when the other is zero), using the existing unit-label helpers.

### 3. Stock can go negative — everywhere

`applyStockDelta`'s update filter drops the `stockPatas: { $gte: -delta }`
half of its precondition; it becomes an unconditional `$inc` gated only on
the document existing (`{ _id: medicineId }`). This is still race-safe —
`$inc` is atomic regardless of the filter — it simply no longer refuses.
`Medicine.stockPatas`'s schema-level `min: 0` (`src/models/Medicine.ts`) is
removed, since negative is now a valid, expected state, not a bug the
validator should catch.

Every caller that currently re-reads the medicine to build a "stock e ache
X, lagbe Y" error after `applyStockDelta` returns `false` — `writeWholesaleSale`,
`recordRetailSale`, and buyer order-approval — drops that branch entirely,
since the call can no longer fail on insufficient stock (it can still fail
on a genuinely missing medicine, which callers keep handling). No
confirmation step is added in the UI; a sale that outruns stock completes
immediately, same as any other sale.

`RetailSaleForm`'s pata `<input max={stockPatas}>` is removed along with the
soft cap it implied — the field keeps `min={1}` but no longer suggests a
ceiling that no longer exists.

**Displaying negative stock:** anywhere `formatStock` (or a raw
`stockPatas`/`stockBoxes` figure) is rendered — `MedicineTable`,
`MedicinePicker`, `DashboardCards`'s low-stock cards — a negative value
renders in the app's existing warning/red token instead of the default
text color, so a negative balance is visually distinct from a low-but-positive
one. The arithmetic itself needs no special case: a later stock-in of 100
patas against a −20 balance lands on 80 through the same `$inc` as always.

## Data flow

**Restocking:** the owner opens Seclo 20's edit page, types 5 in "koto box
dhuklo", saves. `stockIn` runs, `StockEntry` records `boxes: 5, patasAdded:
50` (patasPerBox 10), `stockPatas` goes up by 50, and the entry appears at
the top of the history table on the same page.

**Mixed wholesale sale:** a buyer is sold Seclo 20 as 10 boxes + 3 patas
(patasPerBox 10, boxPricePaisa ৳525.00). `totalPatas = 103`, line total =
`round(103 * 52500 / 10)` = ৳5,407.50 → 540750 paisa. Stock decreases by 103
patas — if only 95 patas were on hand, it now reads −8, shown in red on the
medicine table, and the sale still completed and printed normally.

**Recovering from negative:** the owner later stocks in 20 boxes (200
patas) of that same medicine; `stockPatas` goes from −8 to 192 in one
`$inc`, and the medicine table stops showing red.

## Error handling

| Condition | Result |
| --- | --- |
| Wholesale line: patas entered ≥ `patasPerBox` | Auto-rolled into boxes before submit; never sent to the server as an out-of-range patas value |
| Wholesale/retail/buyer-order sale where quantity exceeds stock | Succeeds; `stockPatas` goes negative; no error surfaced |
| Stock-in or sale against a medicine that no longer exists | Unchanged — `applyStockDelta` still returns `false` on a missing `_id`, callers still report it |
| Medicine deactivated mid-stock-in | Unchanged (existing `stockIn` behaviour) |

## Testing

- `applyStockDelta`: a decrement past zero succeeds and leaves a negative
  `stockPatas`; a decrement against a missing medicine still returns `false`
- `writeWholesaleSale`: a line with only patas, only boxes, and both;
  patas ≥ `patasPerBox` handled client-side (not a server concern once
  rolled up); a sale exceeding stock succeeds and stock goes negative; line
  total rounding matches the "round once over total patas" rule with a
  worked non-dividing example (e.g. `patasPerBox: 7`)
- `recordRetailSale` and buyer order-approval: a sale exceeding stock
  succeeds, no error, stock negative
- Stock-in via the medicine form: same `StockEntry`/`stockPatas` outcome as
  the old `/stock` page, verified through the new call site
- Existing `min: 0` / negative-stock rejection tests are updated to assert
  the new (permissive) behaviour rather than deleted outright, so the
  change in behaviour is visible in the diff

## Verification

Checked in a browser before this is called done: restock a medicine from
its edit page and confirm the history table updates; sell a mixed
box+pata wholesale line and check the invoice math; oversell a medicine on
purpose and confirm the sale completes with the medicine table showing red
negative stock; stock it back up and confirm the red clears at the right
number.
