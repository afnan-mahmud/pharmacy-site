# Retail sale rebuilt on the wholesale flow — design

Date: 2026-08-02

## Problem

Retail (`khuchra`) and wholesale sales currently diverge in almost every way
that matters at the counter:

- `RetailSaleForm` is a single-page form: search one medicine at a time via
  `MedicinePicker`, no quantity steppers, no custom items, no zero-quantity
  lines.
- `recordRetailSale` hard-codes "cash at the counter": `discountPaisa: 0`,
  `paidPaisa: totalPaisa` always, no due is ever created.
- A retail sale has a name+phone snapshot (`buyerPhone`/`buyerName` on `Sale`,
  added by the 2026-07-22 retail-customer work) but no persistent customer
  record, no due ledger, and no invoice number (`invoiceNo: null`, and
  `/invoice/[id]` 404s for any non-wholesale sale).

The owner wants the counter to work exactly like the wholesale screen — same
two-step medicine picker with steppers and custom items — but sell at retail
prices, take an ad hoc name+phone instead of a managed buyer, support a
discount entered as either a percentage or a flat amount, allow partial
payment (baki), and track that baki per phone number the same way wholesale
tracks it per buyer, with its own due page and a printable invoice.

## Scope

Touches the retail counter end to end: `RetailSaleForm`, `recordRetailSale`,
the money engine it shares with wholesale (`computeTotals`), a new retail
customer/due/payment data model, a new "Khuchra Baki" admin page, and the
invoice page's wholesale-only gate.

Wholesale's own UI and stored behaviour are **not changing** — its discount
stays a single percentage field, its buyer stays a managed `Buyer` record.
Two pieces of wholesale's *implementation* are generalised so retail can
reuse them (`computeTotals`'s discount shape, the item→sale-line builder);
every wholesale call site is updated to keep producing the exact numbers it
does today, and existing wholesale tests must keep passing unchanged.

Out of scope: changing wholesale's own discount UI to the two-box style;
buyer-portal login for retail customers; SMS/notification on a retail due;
retroactively assigning invoice numbers to retail sales made before this
ships (they stay `invoiceNo: null`, unprintable, exactly as today).

## Approach

### 1. Discount engine — `src/lib/saleTotals.ts`

`computeTotals` currently takes `discountPercent: number`. It becomes:

```ts
export type DiscountInput =
  | { kind: "percent"; percent: number }   // 0-100, may be fractional
  | { kind: "amount"; amountPaisa: number }; // integer, 0..subtotal

export function computeTotals(
  lines: SaleLine[],
  discount: DiscountInput,
  paidPaisa: number,
): {
  subtotalPaisa: number;
  discountPercent: number; // always populated, for storage/display
  discountPaisa: number;
  totalPaisa: number;
  duePaisa: number;
};
```

- `percent` branch: unchanged math — `discountPaisa = round(subtotal * percent / 100)`,
  `discountPercent` echoes the input.
- `amount` branch: `amountPaisa` is validated as a whole number in
  `[0, subtotalPaisa]` (over-subtotal throws `"Discount subtotal er beshi hote
  parbe na"`, mirroring the existing >100% rejection). `discountPaisa` is
  **exactly** the typed amount — no round-trip through a percentage, so the
  screen and the invoice can never disagree by a paisa over what the owner
  typed. `discountPercent` is derived (`amountPaisa / subtotal * 100`, rounded
  to 2 decimals) purely for display/record — never used to recompute money.

This is the single definition both sale types call, same as today. Two call
sites change shape but not behaviour:

- `writeWholesaleSale.ts` passes `{ kind: "percent", percent: params.discountPercent }`.
- `WholesaleSaleForm.tsx`'s live preview does the same wrap.

`tests/lib/saleTotals.test.ts` gets the existing percent-mode tests updated to
the new call shape (same assertions, same numbers) plus new amount-mode cases
(exact-paisa discount, over-subtotal rejection, 0 amount, derived-percent
rounding).

### 2. Shared line-builder — `src/lib/saleLines.ts` (new)

`writeWholesaleSale`'s per-item loop (resolve medicine or custom item, deduct
stock via `applyStockDelta`, price the line) is extracted verbatim into:

```ts
export async function buildSaleLines(
  items: SaleItemInput[],
  session: ClientSession,
  priceMode: "retail" | "wholesale",
): Promise<SaleLineDraft[]>;
```

`priceMode` selects `wholesaleBoxPricePaisa`/`wholesalePataPricePaisa` vs
`retailBoxPricePaisa`/`retailPataPricePaisa` off the medicine document;
everything else (custom items, box+leftoverPatas convention, stock
deduction, zero-quantity lines staying on the invoice unpriced) is identical
for both. `writeWholesaleSale` calls this with `"wholesale"` and its
behaviour is unchanged (`tests/lib/writeWholesaleSale.test.ts` keeps passing
as-is). The new `writeRetailSale` (below) calls it with `"retail"`.

This also changes how a pure-patas retail line prints: today it is a `"pata"`
unit line (`"10pt"`); after this it is a `"box"` unit line with 0 boxes and
leftoverPatas (`"0bx 10pt"`), matching wholesale's convention. Noted as a
deliberate cosmetic change, not a bug.

### 3. Retail sale write path — `src/lib/writeRetailSale.ts` (new)

A dedicated lib function, parallel to `writeWholesaleSale`, even though it
has one caller today — the transaction is non-trivial (line building,
discount math, invoice numbering, the phone-required-on-due rule) and giving
it its own file keeps it independently unit-testable the same way
`writeWholesaleSale.test.ts` tests wholesale.

```ts
export type WriteRetailSaleParams = {
  session: ClientSession;
  customerName: string;
  customerPhone: string; // "" allowed unless the sale ends up with a due
  items: SaleItemInput[];
  discount: DiscountInput;
  paidPaisa: number;
  createdBy: string;
};
```

Steps inside the transaction:

1. `buildSaleLines(items, session, "retail")` — same "at least one billable
   line" guard as wholesale ("Onto ekta line e poriman dite hobe").
2. `computeTotals(lines, discount, paidPaisa)`.
3. **New rule:** if `duePaisa > 0` and `customerPhone.trim() === ""`, throw
   `"Baki rakhte hole phone number dite hobe"` — a due with no way to find the
   customer again is not allowed to exist.
4. Reserve an invoice number the same way wholesale does —
   `nextInvoiceSeq` / `formatInvoiceNo`, drawing from the **same shared
   counter** as wholesale (one invoice sequence across both sale types, e.g.
   `ABC-000041` wholesale followed by `ABC-000042` retail).
5. If `customerPhone.trim()` is non-empty, upsert `RetailCustomer` (see §4)
   with the latest name — same session, so it commits or rolls back with the
   sale.
6. `SaleModel.create({ type: "retail", buyerId: null, buyerName, buyerPhone,
   invoiceNo, items: lines, subtotalPaisa, discountPercent, discountPaisa,
   totalPaisa, paidPaisa, duePaisa, status: "active", createdBy })`.

### 4. Retail customer identity — `src/models/RetailCustomer.ts` (new)

```ts
{ phone: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  timestamps: true }
```

One document per phone number, latest name wins on every sale (same
"one phone, one remembered name" rule the 2026-07-22 lookup already
established, just now persisted instead of re-derived from the last sale
each time). It has two jobs:

- **Autocomplete source** for the phone field on the retail counter (§7).
- **Concurrency anchor** for `recordRetailPayment` (§5) — the same role
  `BuyerModel.findOneAndUpdate({ $inc: { __v: 1 } })` plays in
  `recordPayment` today. Retail customers have no natural single document to
  bump for that trick until this model exists.

No password, no auth — this is not a login-capable entity, just a durable
"who is this phone number" record.

### 5. Retail due ledger — `src/models/RetailPayment.ts` (new) + `src/actions/due.ts` (extended)

`RetailPayment` mirrors `Payment` with `phone` instead of `buyerId`:

```ts
{ phone: { type: String, required: true, trim: true },
  amountPaisa: { type: Number, required: true, min: 1 },
  note: { type: String, default: "", trim: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  timestamps: true }
// index { phone: 1, createdAt: -1 }
```

`src/lib/retailDueComputation.ts` (new) mirrors `dueComputation.ts`:

- `computeRetailDue(phone, session?)` — `sum(Sale{type:"retail", buyerPhone:
  phone, status:"active"}.duePaisa) - sum(RetailPayment{phone}.amountPaisa)`,
  signed, same credit semantics as `computeBuyerDue`.
- `loadRetailLedger(phone)` — that phone's retail sales + payments, newest
  first.

New exports added to the **existing** `src/actions/due.ts` (not a new action
module — see Testing below for why that matters):

- `listRetailDues(): Promise<RetailDueRow[]>` — groups active retail sales by
  non-empty `buyerPhone`, subtracts `RetailPayment` totals, joins the name
  from `RetailCustomer`. Same shape/sort as `listBuyerDues`.
- `retailDueBalance(phone): Promise<number>`
- `retailLedger(phone): Promise<{ sales, payments }>`
- `recordRetailPayment(phone, amountTaka, note): Promise<ActionResult<void>>`
  — same shape as `recordPayment`: bumps `RetailCustomer.__v` inside the
  transaction as the write-conflict anchor, re-reads `computeRetailDue`
  inside the transaction, rejects `amountPaisa > due` or `due <= 0` with the
  same wording style, creates the `RetailPayment`.

### 6. "Khuchra Baki" page

New route `src/app/(admin)/retail-due/page.tsx` + nav entry, structurally a
clone of `/due`: a new `RetailDueTable` (copy of `DueTable`, keyed by phone
instead of `buyerId`) and `RetailLedger` (copy of `BuyerLedger`). Same
"Mot baki" / credit-callout header, same search-by-name filter, same
"Hisab dekhun" → ledger → "Joma neo" flow.

### 7. RetailSaleForm — two-step UI

**Shared step-1 picker.** `WholesaleSaleForm`'s step-1 block (sticky search,
results grid with box/pata steppers, custom-item drawer) is extracted into
`src/components/SaleItemPicker.tsx`, taking a `priceMode: "retail" |
"wholesale"` prop that picks which price is displayed/used, plus the same
`cart`/`onToggle`/`onQuantityChange`/custom-item callbacks it already has
inline. `WholesaleSaleForm` is refactored to render this extracted component
with `priceMode="wholesale"` and **must keep behaving identically** — this is
a pure extraction, not a redesign, and wholesale's own tests are the proof.

**Step 2** replaces the buyer dropdown with:

- Phone input, optional. Debounced (250ms) call to a new action
  `searchRetailCustomers(query): Promise<{ name: string; phone: string }[]>`
  (queries `RetailCustomerModel` by `phone` prefix, limit ~8) renders a
  dropdown of matches under the field, styled like `MedicinePicker`'s
  dropdown. Clicking a row fills phone + name (name stays editable after).
  This action replaces `lookupRetailCustomer`, which has no other caller.
- Name input, required (unchanged rule from the 2026-07-22 work).
- Cart table: same row layout as wholesale's step-2 table (medicine, rate,
  box/pata inputs, line total, remove, "invoice e thakbe, dam nai" on a
  zero line) — priced at retail rates.
- Discount row: two boxes, `% ` and `৳`, sharing one `discountMode: "percent"
  | "amount"` piece of state. Editing the percent box sets
  `discountMode="percent"` and recomputes the amount box's displayed value
  from the current subtotal; editing the amount box does the reverse. Only
  the active mode's raw value is sent to `recordRetailSale`; the other box is
  always showing a live-derived number, never independently authoritative.
- Joma (paid, ৳) input — same field as wholesale.
- Totals panel — subtotal / discount line / mot / baki (red) or "customer
  pabe" (teal), same as wholesale's.
- On submit, if the computed due would be `> 0` and phone is blank, the form
  blocks submission client-side with the same message the server would give,
  before ever calling the action.
- On success: same success panel as wholesale — "Invoice `{no}` record
  kora hoyeche!" + a `/invoice/{saleId}` print link — instead of today's
  plain "Bikri record kora hoyeche." text.

### 8. `recordRetailSale` — `src/actions/sales.ts`

`RetailSaleInput` becomes structurally the same shape as `WholesaleSaleInput`
minus `buyerId`, plus the discount union:

```ts
export type RetailSaleInput = {
  items: (
    | { medicineId: string; boxes: number; patas: number }
    | { customName: string; customPricePaisa: number; boxes: number; patas: number }
  )[];
  customerName: string;      // required
  customerPhone?: string;    // optional unless the sale nets a due
  discount: DiscountInput;
  paidPaisa: number;
};
```

`validateRetail` is rewritten to share its per-item shape checks with
`validateWholesale` (medicineId-or-custom, non-negative integer boxes/patas,
no duplicate medicine) via one extracted helper, `validateSaleItems(items)`,
called by both — removing the duplication that would otherwise exist between
two now-structurally-identical loops. `recordRetailSale` itself becomes a
thin wrapper: guard → validate → open transaction → `writeRetailSale(...)` →
revalidate `/medicines`, `/sell`, `/retail-due`.

### 9. Invoice printing

`src/app/(admin)/invoice/[id]/page.tsx` drops the
`if (sale.type !== "wholesale") notFound()` gate. `Invoice.tsx` needs no
change — it already renders generically off `buyerName`/`buyerShopName`
(blank for retail, already conditionally rendered) and already handles
`discountPercent`/`discountPaisa`/`duePaisa` generically. `cancelSale`
already works per-sale regardless of type (it only special-cases lines with
a `medicineId`), so retail cancellation needs no change beyond also
revalidating `/retail-due`.

### 10. Migration

`scripts/backfill-retail-customers.ts` (new, following
`migrate-pricing-fields.ts`'s pattern): scans existing `retail` sales for
distinct non-empty `buyerPhone`, taking the most-recent `buyerName` per
phone, and upserts `RetailCustomer` rows. Safe to re-run. Must run before
this ships, so the phone-autocomplete and due ledger aren't blind to
customers who bought before this feature existed. Documented as a
DEPLOY-ORDER script like its predecessor, though — unlike the pricing
migration — the app degrades gracefully if it's skipped (new customers just
build up the ledger from that point forward; nothing crashes or renders
`NaN`).

## Data flow

Owner opens Khuchra Bikri, picks 2 Napa boxes + a custom "Syringe" item at
step 1 (steppers, same as wholesale), hits checkout. At step 2 they type
`0171...`; after 250ms a matching `RetailCustomer` row appears and they click
it, filling name "Karim". They type `50` in the amount-discount box (the
percent box updates to show the derived %), enter `৳300` as Joma. Total is
৳800, so duePaisa = 500 > 0 and phone is set, so the sale is allowed.
`writeRetailSale` deducts stock, reserves the next invoice number from the
shared counter, upserts `RetailCustomer{phone: "0171...", name: "Karim"}`,
writes the `Sale`. The success panel shows "Invoice ABC-000042" with a print
link. On `/retail-due`, Karim now appears with a ৳500 baki; opening his ledger
shows this sale and any later `RetailPayment`.

## Error handling

| Condition | Result |
| --- | --- |
| Cart has no billable line | `"Onto ekta line e poriman dite hobe"` (shared with wholesale) |
| Name missing/blank | `"Customer nam likhte hobe"` |
| Amount discount exceeds subtotal | `"Discount subtotal er beshi hote parbe na"` |
| Percent discount out of [0,100] | existing message, unchanged |
| Due > 0 with blank phone | `"Baki rakhte hole phone number dite hobe"`, checked client-side before submit and server-side inside the transaction |
| `recordRetailPayment` amount > current due | same wording style as `recordPayment`'s equivalent error |
| `recordRetailPayment` on phone with due `<= 0` | same "kono baki nei" wording, including the "already in credit" variant |
| Old retail sale (`invoiceNo: null`) opened at `/invoice/[id]` | still 404s — never retroactively printable |

## Testing

- `tests/lib/saleTotals.test.ts`: percent-mode tests updated to the new call
  shape; new amount-mode tests (exact paisa, over-subtotal rejection, derived
  percent rounding, 0 amount).
- `tests/lib/writeWholesaleSale.test.ts`: unchanged assertions, must still
  pass — the proof the extraction in §2/§1 didn't move wholesale's numbers.
- `tests/lib/saleLines.test.ts` (new): `buildSaleLines` for both price modes
  — medicine line, custom item, zero-quantity line, stock deduction, box vs
  patas-only line shape.
- `tests/lib/writeRetailSale.test.ts` (new): full transaction — discount both
  modes, partial payment creating a due, due-without-phone rejection,
  `RetailCustomer` upsert, invoice number drawn from the shared counter,
  zero-quantity and custom-item lines.
- `tests/actions/sales.test.ts`: `recordRetailSale` tests updated for the new
  input shape (every existing call site touched deliberately, not swept, per
  the note already in this file about the percentage-discount incident);
  `searchRetailCustomers` tests (prefix match, limit, admin-only); old
  `lookupRetailCustomer` tests removed with it.
- `tests/actions/due.test.ts`: new `listRetailDues` / `retailDueBalance` /
  `retailLedger` / `recordRetailPayment` tests, mirroring the existing buyer
  ones including the double-submit race test for the `RetailCustomer.__v`
  bump.
- `tests/actions/authorization.test.ts`: no structural change needed — the
  new exports land in the already-listed `src/actions/due.ts` and
  `src/actions/sales.ts`, so `import.meta.glob`'s sweep picks them up
  automatically; only the money-flow assertions elsewhere change, not this
  file.
- Migration script gets a manual dry-run note in its own header, per the
  existing scripts' convention, rather than an automated test (matches
  `migrate-pricing-fields.ts` and `migrate-invoice-index.ts`, neither of
  which has one).

## Verification

Browser-checked before this is called done, per the project's standing rule
that tests passing is not the same as the feature working in the page:
a retail sale with a percent discount, one with an amount discount, one left
partially paid (due created, phone required, appears on `/retail-due`), a
`RetailPayment` recorded against it, the printed invoice for a retail sale,
and a plain fully-paid retail sale with no phone at all (must still succeed).
