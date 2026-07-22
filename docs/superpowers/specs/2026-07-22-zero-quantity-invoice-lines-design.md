# Zero-quantity invoice lines — design

Date: 2026-07-22

Branch note: this work stacks on `feat/medicine-forms`, which is not yet merged
into `main`.

## Problem

A buyer orders five products. One of them is out of stock. The owner approves
the order, and the invoice that comes out says nothing at all about the fifth
product — the line is gone.

That silence is the bug. The buyer cannot tell whether the item was forgotten,
refused, or simply unavailable, and the owner has no record on the paper that
the request was seen and could not be met.

What the owner wants instead: keep the product on the invoice, with a quantity
of zero and no price. The zero says "you asked for this, we could not supply
it" without charging anything for it.

Today the opposite happens. `PendingOrders.handleApprove` filters the approval
list with `.filter((i) => i.boxes > 0)`, so a line the owner zeroes is dropped
before it ever reaches the server. On the wholesale form a zero cannot even be
typed: `updateBoxes` snaps anything below 1 back to 1.

## Scope

Two invoice-producing paths: order approval and the wholesale sale form. Both
already write through `writeWholesaleSale`.

Also in scope, as a separate defect found in the same code: the retail form
currently lets the owner type `0` or a negative quantity into a cart line and
only fails on submit, with a server error. Retail is a cash counter that prints
nothing, so it gets the opposite treatment from the other two — a hard minimum
of one.

Out of scope: any reason text or "out of stock" marker attached to a zero line.
The zero itself carries the meaning.

## Approach

Let a sale line hold a quantity of zero, all the way from the approval screen
into the stored sale and onto the printed invoice. Nothing about a zero line is
a special case downstream — it is an ordinary line whose numbers happen to be
zero — except that it deducts no stock and prints no money.

### What a zero line means

| | Zero line | Normal line |
| --- | --- | --- |
| Stored in `Sale.items[]` | yes | yes |
| `quantity` | `0` | `>= 1` |
| `patasDeducted` | `0` | `>= 1` |
| Stock deducted | no | yes |
| `lineTotalPaisa` | `0` | rate × quantity |
| Printed on the invoice | name and `0` only | name, qty, rate, amount |

### Models

`src/models/Sale.ts` — `saleLineSchema.quantity` and
`saleLineSchema.patasDeducted` both relax from `min: 1` to `min: 0`. Those two
constraints are the only thing keeping a negative quantity out of the database,
so they stay, at zero.

`Order` is untouched. A buyer still cannot order zero of something; the zero is
the owner's answer, not the buyer's request.

### Server rules

`validateWholesale` (`src/actions/sales.ts`) and `validateApproval`
(`src/actions/adminOrders.ts`) currently reject `boxes < 1`. Both relax to
reject `boxes < 0`. They keep rejecting non-integers, duplicate medicines, and
empty item lists exactly as they do now.

Relaxing those alone would allow an invoice where every line is zero — a
document that bills nothing for nothing. So one new rule is added: **a sale
must have at least one line with a quantity above zero.**

That rule lives in `src/lib/writeWholesaleSale.ts`, not in either action. That
file already declares itself "the single definition of 'make a wholesale
sale'", and both paths go through it, so putting the rule there is what stops
the wholesale form and order approval from drifting into two different ideas of
what a sale is. The per-field shape checks stay in the actions, where the
network trust boundary is.

The error reads `"Onto ekta line e poriman dite hobe"`.

### Stock

`writeWholesaleSale` skips `applyStockDelta` entirely when a line's quantity is
zero. Calling it with a delta of zero would issue a `$inc: 0` — a write that
changes nothing — and its "does this medicine still exist" half is already
covered by the `findById` a few lines above, which throws `"Medicine pawa jay
ni"`.

`cancelSale` is deliberately left alone. Returning a `patasDeducted` of zero
through `applyStockDelta` is harmless, and that call also verifies the medicine
still exists, which is worth keeping on the cancellation path.

### Quantity parsing

`src/lib/quantityInput.ts` (new):

```ts
/**
 * Reads a quantity out of a number input. Anything unparseable, fractional or
 * below `minimum` — including an empty field, which is what the browser hands
 * back mid-edit — becomes `minimum`.
 */
export function parseQuantityInput(raw: string, minimum: number): number;
```

The three cart screens parse quantities three different ways today, and two of
those ways are wrong:

| Screen | `0` typed | field cleared | `-5` typed |
| --- | --- | --- | --- |
| Wholesale | becomes `1` | becomes `1` | becomes `1` |
| Retail | stays `0`, **fails on submit** | stays `0`, fails | stays `-5`, **fails on submit** |
| Order approval | stays `0` | stays `0` | stays `-5`, **fails on submit** |

After this change all three call `parseQuantityInput` — wholesale and order
approval with a minimum of `0`, retail with a minimum of `1`.

### Screens

**`PendingOrders.tsx`** — drop the `.filter((i) => i.boxes > 0)` from
`handleApprove`; that filter is what deletes the line today. Parse through
`parseQuantityInput(raw, 0)`.

**`WholesaleSaleForm.tsx`** — input `min={0}`, and `updateBoxes` parses through
`parseQuantityInput(raw, 0)` instead of snapping to 1.

**`RetailSaleForm.tsx`** — `updatePatas` parses through
`parseQuantityInput(raw, 1)`, so zero and negative quantities can no longer be
entered at all.

On both invoice screens a zeroed row is dimmed and carries a quiet `bill hobe
na` note, so the owner can see at a glance which lines the invoice will not
charge for. When every row is zero the submit and approve buttons are disabled
with the reason shown, rather than letting the request reach the server and come
back with an error.

**`Invoice.tsx`** — a line whose `quantity` is `0` prints its name and the `0`,
and leaves the rate and amount cells empty. Both money columns, not just the
rate: the owner's requirement was that the line carry no price on the invoice at
all.

## Data flow

A buyer orders 10 cartons of a syrup that is out of stock, plus 3 boxes of a
tablet. The owner opens `/orders`, sets the syrup row to `0` — it dims and reads
`bill hobe na` — and approves. `approveOrder` accepts both lines, and
`writeWholesaleSale` sees one line above zero so the sale is valid. It deducts
stock for the tablet only and writes two lines, the syrup's with
`quantity: 0, patasDeducted: 0, lineTotalPaisa: 0`. The invoice prints the syrup
row with a bare `0` and no money, and the tablet row in full. The subtotal
counts the tablet alone.

## Error handling

- Every line zero: rejected by `writeWholesaleSale` before any stock moves, and
  prevented on both screens before the request is sent.
- Negative or fractional quantity: rejected at the action boundary, and no
  longer typeable on any of the three screens.
- Existing errors — unknown medicine, duplicate line, empty cart, a medicine
  outside the original order, insufficient stock — are unchanged.

## Testing

- `tests/lib/quantityInput.test.ts` (new) — `"0"`, `""`, `"-5"`, `"2.5"`,
  `"abc"`, a large value, at both minimums.
- `tests/actions/adminOrders.test.ts` — approving with one line zeroed stores
  both lines; the zeroed medicine's stock is unchanged; the sale's subtotal
  counts only the billed line; approving with every line zero is rejected.
- `tests/actions/sales.test.ts` — the same two cases through
  `recordWholesaleSale`; cancelling a sale that has a zero line returns only the
  stock that actually left.
- Existing tests asserting `"Poriman 1 er kom hote parbe na"` on these two paths
  are updated — that message no longer fires for `0`, only for a negative.

## What this does not do

It does not put a reason on the line. It does not change what a buyer can
order. It does not let a retail sale carry a zero line — retail prints nothing,
so a line that charges nothing has no reader.
