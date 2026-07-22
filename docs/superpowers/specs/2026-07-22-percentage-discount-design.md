# Percentage discount — design

Date: 2026-07-22

Branch note: this stacks on `feat/buyer-search` → `feat/zero-quantity-lines` →
`feat/medicine-forms`. None is merged into `main` yet.

## Problem

The wholesale sale form asks for a discount in taka. The owner thinks in
percent — "give this shop 10% off" — and currently has to work out what 10% of
the subtotal is, retype it as an amount, and redo the arithmetic every time a
line changes.

## Scope

Discount exists in exactly one place: the wholesale sale form. Retail passes
`discountPaisa: 0` (a cash counter takes no discount), and order approval passes
`0` as well.

The taka-amount discount is **removed**, not kept alongside the percentage. One
field, one rule.

Out of scope: a discount on the order-approval screen, a discount at the retail
counter, and `src/lib/discount.ts` — that module computes the MRP-versus-price
chip on the buyer storefront and has nothing to do with this.

## Approach

### The percent is the input; the amount is derived once

`computeTotals` changes shape:

```ts
export function computeTotals(
  lines: SaleLine[],
  discountPercent: number,
  paidPaisa: number,
): {
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  duePaisa: number;
};
```

It now takes the percent and **returns the resulting `discountPaisa`**.

That return value is the point of the change. Today the client preview and the
server each call `takaToPaisa(discount)` independently, which is safe only
because both get the same answer from the same string. A percentage introduces a
rounding step, and two independent roundings can disagree — the screen would
promise one total and the invoice would print another. Making `computeTotals`
the only thing that turns a percent into paisa, and having every caller store
what it returns, removes that possibility rather than relying on two call sites
staying in step.

The function stays in `src/lib/saleTotals.ts`, whose stated purpose is already
"the money arithmetic for a sale... so the retail and wholesale actions cannot
drift into two different definitions of total".

### Rounding

```ts
const discountPaisa = Math.round(
  Number(((subtotalPaisa * discountPercent) / 100).toFixed(4)),
);
```

The `toFixed(4)` before rounding mirrors `takaToPaisa` in `src/lib/money.ts`,
which uses the same guard because binary floating point turns products like
`1.005 * 100` into `100.4999…`. Rounding is to the nearest paisa; a half rounds
up, in the customer's favour.

### Validation

`discountPercent` must be a finite number, at least 0 and at most 100. Unlike
every other money field in this system it may be fractional — 2.5% is a real
discount — so it gets its own guard rather than passing through
`assertWholeNonNegative`.

The existing check `"Discount total er cheye beshi hote parbe na"` is **deleted**.
With the percent capped at 100 a discount can no longer exceed the subtotal, so
the check is unreachable; keeping a dead guard suggests a danger that no longer
exists. Its replacement is the range check, which fails with
`"Discount 100% er beshi hote parbe na"`.

`paidPaisa` keeps its existing whole-non-negative guard and its
`"Joma taka total er cheye beshi hote parbe na"` check.

### Storage

`Sale` gains `discountPercent: { type: Number, required: true, default: 0, min: 0 }`
alongside the existing `discountPaisa`.

Both, because they answer different questions: the percent is what was agreed
with the buyer, the paisa is what was actually taken off. Sales written before
this change have no percent and read back as `0`/absent, which the invoice
handles by printing the amount alone — exactly what those invoices said when
they were printed.

### Server actions

- `WholesaleSaleInput.discountPaisa` → `discountPercent`.
- `WriteWholesaleSaleParams.discountPaisa` → `discountPercent`.
- `writeWholesaleSale` stores the `discountPaisa` that `computeTotals` returned,
  never a figure of its own.
- `approveOrder` passes `discountPercent: 0` where it passed `discountPaisa: 0`.
- `recordRetailSale` is unchanged in behaviour; its `computeTotals` call passes
  a percent of `0`.

### UI

`WholesaleSaleForm`: the field is relabelled `Discount (%)`, and the preview
names both numbers so the owner sees the consequence as they type:

```
Discount (10%)          − ৳63.10
```

**The input deliberately gets no `max={100}`.** It sits inside the form that
submits the sale, and an HTML `min`/`max` there makes the browser's own
constraint validation block submission with a native bubble — the exact failure
that stopped zero-quantity lines from ever reaching the server (see
`2026-07-22-zero-quantity-invoice-lines-design.md`). Out-of-range input is
caught instead by the form's existing `totalsError` path: `computeTotals`
throws, the message renders, and the submit button is already disabled while
`totalsError` is set.

`Invoice`: the discount line prints the percent beside the amount when a percent
is recorded, and the amount alone when it is not.

## Data flow

The owner builds a two-line wholesale cart totalling ৳631.00 and types `10` into
Discount (%). `WholesaleSaleForm` calls `computeTotals(lines, 10, paid)`, which
returns `discountPaisa: 6310` and `totalPaisa: 56790`; the preview renders
"Discount (10%) − ৳63.10". On submit the action receives `discountPercent: 10`,
`writeWholesaleSale` calls the same `computeTotals` with the same inputs, and
stores `discountPercent: 10` and the returned `discountPaisa: 6310`. The invoice
prints "Discount (10%) − ৳63.10", and the buyer's due ledger sees
`totalPaisa: 56790` as it always has.

## Error handling

| Input | Result |
| --- | --- |
| percent below 0 | `"Discount 0 er kom hote parbe na"` |
| percent above 100 | `"Discount 100% er beshi hote parbe na"` |
| percent not a finite number | `"Discount thik nai"` |
| paid above total | unchanged: `"Joma taka total er cheye beshi hote parbe na"` |

On the form each of these surfaces through the existing `totalsError` render
path and keeps the submit button disabled, so none of them can reach the server
from our own UI. The server still validates, because the action is a
network-reachable boundary.

## Testing

`tests/lib/saleTotals.test.ts` — rewritten for the new signature:

- the subtotal is unaffected by the discount
- a whole percent: 10% of 43000 is 4300, total 38700
- a fractional percent: 2.5% of 43000 is 1075
- a percent that does not divide evenly rounds to the nearest paisa, with a
  case whose exact product ends in `.5`
- 0% yields a `discountPaisa` of 0 and leaves the total at the subtotal
- 100% yields a total of 0
- above 100, below 0, and non-finite percents each throw their message
- `discountPaisa` is returned, and equals what the total implies
- an empty sale returns all zeros including `discountPaisa`
- the `paidPaisa` guards still hold

`tests/actions/sales.test.ts` — a wholesale sale created with a percent stores
both `discountPercent` and the derived `discountPaisa`, and its `totalPaisa`
matches; a percent above 100 is rejected.

`tests/lib/writeWholesaleSale.test.ts` and `tests/actions/adminOrders.test.ts` —
updated for the renamed parameter.

Every existing test that passes `discountPaisa` to `computeTotals` or to a sale
action is updated; the numbers change meaning, so each assertion is re-derived
rather than mechanically renamed.

## Verification

Tests, `tsc --noEmit` and `npm run build` are necessary but not sufficient here:
the two bugs in the zero-quantity work — a stale `min={1}` and a lost JSX space —
passed all three. This change is checked in a real browser before it is called
done: a wholesale sale with a percentage discount, submitted, with the resulting
invoice read on screen.
