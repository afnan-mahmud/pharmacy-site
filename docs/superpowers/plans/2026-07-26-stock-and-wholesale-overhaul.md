# Stock & Wholesale Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold Stock In into the medicine form, let a wholesale sale carry a leftover-patas quantity alongside boxes (priced as a fair fraction of the box rate), and let any sale (retail, wholesale, buyer-order-approval) proceed even when it outruns on-hand stock — stock goes negative instead of being blocked.

**Architecture:** Money stays integer paisa, stock stays integer patas — both invariants from `docs/superpowers/specs/2026-07-26-stock-and-wholesale-overhaul-design.md` are unchanged. What changes is that `stockPatas` may now be negative, `applyStockDelta` no longer refuses a decrement past zero, and a wholesale sale line gains a second quantity (`leftoverPatas`) that shares one rounded price with its box portion.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose/MongoDB (transactions), Vitest + mongodb-memory-server.

## Global Constraints

- Money is integer paisa, never floats. Stock is integer patas, never boxes.
- Every stock change goes through `applyStockDelta` (`src/lib/stockTransaction.ts`) — never a bare `$inc`.
- Every server action calls its guard first (`requireAdminAction`/`requireBuyerAction`).
- All user-facing strings are Banglish (Bengali in Latin letters), never Bengali script. ৳ is fine.
- No component tests exist in this codebase (`tests/**/*.test.ts` only) — UI-only tasks are verified by running the existing suite plus a manual browser check, not new `.test.tsx` files.
- Follow the existing code's documentation style: a comment only where the *why* is non-obvious, never restating the *what*.

---

## Task 1: `formatStock` renders negative stock without throwing

**Files:**
- Modify: `src/lib/units.ts:57-69` (`formatStock`)
- Test: `tests/lib/units.test.ts:116-118, 133-137`

**Interfaces:**
- Consumes: `splitStock(stockPatas, patasPerBox)` (unchanged, still rejects negative input — untouched by this task)
- Produces: `formatStock(stockPatas: number, patasPerBox: number, form: unknown): string` — now accepts negative `stockPatas` and prefixes the result with `-`

- [ ] **Step 1: Write the failing tests**

Replace the two tests in `tests/lib/units.test.ts` that currently assert `formatStock` throws on negative input:

```ts
// Replaces "rejects negative stockPatas" at line 116-118
it("renders negative stock with a minus sign", () => {
  expect(formatStock(-1, 10, "tablet")).toBe("-1 pata");
  expect(formatStock(-8, 10, "tablet")).toBe("-8 pata");
  expect(formatStock(-23, 10, "tablet")).toBe("-2 box 3 pata");
  expect(formatStock(-20, 10, "tablet")).toBe("-2 box");
});
```

```ts
// Replaces "validates numbers before it looks at the form" at line 133-137
it("falls back to box/pata wording for an unknown form even when negative", () => {
  expect(formatStock(-1, 10, "definitely-not-a-form")).toBe("-1 pata");
});
```

Leave every other test in the file untouched — `splitStock`'s own "rejects negative stockPatas" test (line 59-61) still holds, since `splitStock` itself is not changing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: FAIL — the two new/changed assertions fail because `formatStock(-1, ...)` still throws "stockPatas cannot be negative".

- [ ] **Step 3: Implement**

In `src/lib/units.ts`, change `formatStock` to strip the sign before delegating to `splitStock` (which keeps rejecting negative input — nothing about its contract changes) and reattach it to the formatted string:

```ts
export function formatStock(
  stockPatas: number,
  patasPerBox: number,
  form: unknown,
): string {
  // splitStock still validates (integer-ness, NaN/Infinity) and still
  // rejects a negative value — so the sign is stripped here, before the
  // call, rather than loosening splitStock's own contract for every caller.
  const negative = stockPatas < 0;
  const { boxes, patas } = splitStock(Math.abs(stockPatas), patasPerBox);
  const labels = unitLabelsFor(form);
  const sign = negative ? "-" : "";
  if (boxes === 0) return `${sign}${patas} ${labels.inner}`;
  if (patas === 0) return `${sign}${boxes} ${labels.outer}`;
  return `${sign}${boxes} ${labels.outer} ${patas} ${labels.inner}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts tests/lib/units.test.ts
git commit -m "feat: render negative stock instead of throwing"
```

---

## Task 2: Stock can go negative — `applyStockDelta` and the `Medicine` schema

**Files:**
- Modify: `src/lib/stockTransaction.ts:41-52` (`applyStockDelta`)
- Modify: `src/models/Medicine.ts:30` (`stockPatas` schema field)
- Test: `tests/lib/stockTransaction.test.ts`

**Interfaces:**
- Produces: `applyStockDelta(medicineId, delta, session): Promise<boolean>` — now returns `false` **only** when the medicine no longer exists, never for insufficient stock

- [ ] **Step 1: Write the failing tests**

In `tests/lib/stockTransaction.test.ts`, replace the two negative-refusal tests (lines 65-85: "never drives stock negative..." and "refuses a decrement that would land exactly one pata below zero") with:

```ts
it("allows a decrement larger than available stock, landing on negative stock", async () => {
  const medicine = await createMedicineDirect(50);
  const matched = await runInTransaction((session) =>
    applyStockDelta(medicine._id, -500, session),
  );
  expect(matched).toBe(true);

  const updated = await MedicineModel.findById(medicine._id);
  expect(updated!.stockPatas).toBe(-450);
});

it("allows a decrement that lands one pata below zero", async () => {
  const medicine = await createMedicineDirect(10);
  const matched = await runInTransaction((session) =>
    applyStockDelta(medicine._id, -11, session),
  );
  expect(matched).toBe(true);

  const updated = await MedicineModel.findById(medicine._id);
  expect(updated!.stockPatas).toBe(-1);
});

it("recovers from negative stock on a later increment", async () => {
  const medicine = await createMedicineDirect(10);
  await runInTransaction((session) => applyStockDelta(medicine._id, -30, session));
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-20);

  await runInTransaction((session) => applyStockDelta(medicine._id, 100, session));
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(80);
});
```

Leave "allows a decrement that lands exactly on zero" and "reports no match... when the medicine no longer exists" untouched — both still hold.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/stockTransaction.test.ts`
Expected: FAIL — `matched` is `false` for the two decrement-past-zero cases, because the filter still refuses them.

- [ ] **Step 3: Implement**

In `src/lib/stockTransaction.ts`, drop the quantity half of the precondition — the filter now only checks existence:

```ts
export async function applyStockDelta(
  medicineId: Types.ObjectId,
  delta: number,
  session: ClientSession,
): Promise<boolean> {
  const result = await MedicineModel.updateOne(
    { _id: medicineId },
    { $inc: { stockPatas: delta } },
    { session },
  );
  return result.matchedCount > 0;
}
```

Update the file's doc comment (lines 4-40) to describe the new behaviour: stock is now allowed to go negative — a wholesale or retail sale, or a buyer-order approval, may take more than is on hand — and `matchedCount === 0` now means only "this medicine no longer exists," not "insufficient stock." Keep the explanation of *why* this still goes through a single atomic `$inc` rather than a pre-read (the retry-under-`withTransaction` reasoning is unchanged and still worth stating).

In `src/models/Medicine.ts:30`, drop `min: 0` — negative is now a valid, expected state, not a bug the schema should catch:

```ts
// Canonical stock. Always patas, never boxes. May be negative — a sale can
// outrun what is on hand; see src/lib/stockTransaction.ts. See src/lib/units.ts.
stockPatas: { type: Number, required: true, default: 0 },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/stockTransaction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stockTransaction.ts src/models/Medicine.ts tests/lib/stockTransaction.test.ts
git commit -m "feat: allow stock to go negative instead of refusing a sale"
```

---

## Task 3: Sale paths stop blocking on insufficient stock

**Files:**
- Modify: `src/lib/writeWholesaleSale.ts:63-78` (per-item stock decrement)
- Modify: `src/actions/sales.ts:100-114` (`recordRetailSale`'s per-item stock decrement)
- Test: `tests/lib/writeWholesaleSale.test.ts:114-129`
- Test: `tests/actions/sales.test.ts:163-202`
- Test: `tests/actions/adminOrders.test.ts:184-196`

**Interfaces:**
- Consumes: `applyStockDelta` from Task 2 (now only fails on a missing medicine)
- Produces: no change to any exported function's signature — only their internal error behaviour changes

- [ ] **Step 1: Write the failing tests**

In `tests/lib/writeWholesaleSale.test.ts`, replace "throws and aborts when stock is short, leaving stock untouched" (lines 114-121) and "never lets stock go negative" (lines 123-129) with:

```ts
it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
  const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 3 }],
  });
  expect(sale!.totalPaisa).toBe(36000);
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
});
```

In `tests/actions/sales.test.ts`, replace "refuses to sell more than the stock and changes nothing" (lines 163-172) and "stock can never go negative through this path" (lines 195-202) with:

```ts
it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
  const medicine = await makeMedicine({}, 5);
  const sale = await unwrap(
    recordRetailSale({ items: [{ medicineId: medicine._id, patas: 6 }], customerName: "Walk-in" }),
  );
  expect(sale.totalPaisa).toBeGreaterThan(0);
  const after = await MedicineModel.findById(medicine._id);
  expect(after!.stockPatas).toBe(-1);
});
```

Also update "rolls back every line when a later line is short" (lines 174-193): this test's premise — that a short line aborts the whole sale — no longer holds. Replace it with a test that the *first* medicine's stock is still deducted correctly even though the *second* line in the same cart also goes negative, confirming both writes land inside the one transaction rather than one silently failing:

```ts
it("deducts every line in the same transaction, even when more than one goes negative", async () => {
  const a = await makeMedicine({}, 500);
  const b = await makeMedicine({ name: "Ace" }, 1);

  await unwrap(recordRetailSale({
    items: [
      { medicineId: a._id, patas: 2 },
      { medicineId: b._id, patas: 5 },
    ],
    customerName: "Walk-in",
  }));

  expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(498);
  expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(-4);
});
```

In `tests/actions/adminOrders.test.ts`, replace "aborts when stock is short and leaves the order pending, stock intact, no invoice consumed" (lines 184-196) with:

```ts
it("approves even when stock is short, leaving stock negative and the order approved", async () => {
  const buyer = await makeBuyer();
  const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
  const order = await makeOrder(buyer._id, medicine, 3);

  const sale = await unwrap(
    approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 3 }]),
  );
  expect(sale.items[0].quantity).toBe(3);
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  expect((await OrderModel.findById(order._id))!.status).toBe("approved");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts tests/actions/adminOrders.test.ts`
Expected: FAIL — each new test's sale call currently throws "stock e ache...".

- [ ] **Step 3: Implement**

In `src/lib/writeWholesaleSale.ts`, drop the insufficient-stock branch — `applyStockDelta` can now only fail on a missing medicine, which is already effectively unreachable here (the medicine was just read moments earlier in the same transaction), but the check stays as a defensive fallback with a plain message:

```ts
if (patas > 0) {
  const ok = await applyStockDelta(medicine._id, -patas, session);
  if (!ok) throw new Error("Medicine pawa jay ni");
}
```

This removes the `unitLabelsFor`-derived `unit` variable and the second `MedicineModel.findById` re-read that built the old "stock e ache X, lagbe Y" message — both are now dead code. `unitLabelsFor` was only ever called at that one spot in this file, so remove its import (`import { unitLabelsFor } from "@/lib/unitLabels";`) too — leave `boxesToPatas`, `applyStockDelta`, `lineTotal`, `computeTotals` and the rest of the file's imports as they are, since each of those is still used elsewhere in the file.

In `src/actions/sales.ts`'s `recordRetailSale`, make the identical change:

```ts
const ok = await applyStockDelta(medicine._id, -item.patas, session);
if (!ok) throw new Error("Medicine pawa jay ni");
```

Same removal: the `unit` variable and the re-read for the current-stock message are gone. `unitLabelsFor` is called only at that one spot in `src/actions/sales.ts` too, so remove its import (`import { unitLabelsFor } from "@/lib/unitLabels";`) from this file as well.

Update each function's doc comment where it references the old "insufficient stock" behaviour (`writeWholesaleSale`'s file-level comment, `recordRetailSale`'s inline comment above the check) to say a sale now always succeeds once the medicine is found, and stock may go negative.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts tests/actions/adminOrders.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite to check for collateral damage**

Run: `npx vitest run`
Expected: PASS. (Watch specifically for any other test asserting on the old "stock e ache" message — none are known to exist outside the files touched above, per a repo-wide grep, but the full run is the actual check.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/writeWholesaleSale.ts src/actions/sales.ts tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts tests/actions/adminOrders.test.ts
git commit -m "feat: let a sale exceed stock instead of blocking with an error"
```

---

## Task 4: Wholesale line carries boxes and leftover patas, priced as one

**Files:**
- Modify: `src/models/Sale.ts:3-35` (`saleLineSchema`)
- Modify: `src/lib/saleTotals.ts` (new `wholesaleLineTotal`)
- Modify: `src/lib/writeWholesaleSale.ts` (combine boxes + patas, use the new pricing)
- Modify: `src/actions/sales.ts:178-234` (`WholesaleSaleInput`, `validateWholesale`)
- Test: `tests/lib/saleTotals.test.ts` (new tests — check this file exists first; create if not)
- Test: `tests/lib/writeWholesaleSale.test.ts`
- Test: `tests/actions/sales.test.ts`

**Interfaces:**
- Consumes: `boxesToPatas` from `src/lib/units.ts` (unchanged)
- Produces:
  - `wholesaleLineTotal(totalPatas: number, boxPricePaisa: number, patasPerBox: number): number` (new, exported from `src/lib/saleTotals.ts`)
  - `WriteWholesaleSaleParams.items: { medicineId: string; boxes: number; patas?: number }[]` (was `{ medicineId: string; boxes: number }[]`)
  - `WholesaleSaleInput.items: { medicineId: string; boxes: number; patas: number }[]` (was without `patas`)
  - Sale line document gains `leftoverPatas: number` (default `0`)

- [ ] **Step 1: Write the failing test for `wholesaleLineTotal`**

`tests/lib/saleTotals.test.ts` already exists, starting with `import { describe, it, expect } from "vitest";` and `import { lineTotal, computeTotals } from "@/lib/saleTotals";`. Add `wholesaleLineTotal` to that existing import line — do not add a second `import` line — and append this new `describe` block to the end of the file:

```ts
describe("wholesaleLineTotal", () => {
  it("prices an exact number of boxes the same as boxes * rate", () => {
    // 10 boxes, patasPerBox 10, box rate ৳525.00 -> 10 boxes worth of patas.
    expect(wholesaleLineTotal(100, 52500, 10)).toBe(525000);
  });

  it("prices a box plus leftover patas as a fraction of the box rate", () => {
    // 10 boxes + 3 patas = 103 total patas, patasPerBox 10, box rate ৳525.00.
    // 103 * 52500 / 10 = 540750 exactly.
    expect(wholesaleLineTotal(103, 52500, 10)).toBe(540750);
  });

  it("rounds once over the whole line when the division is not exact", () => {
    // patasPerBox 7, box rate ৳600.00 (60000 paisa): 60000/7 = 8571.428...
    // per pata. 1 box + 2 patas = 9 total patas.
    // 9 * 60000 / 7 = 77142.857... -> rounds to 77143.
    expect(wholesaleLineTotal(9, 60000, 7)).toBe(77143);
  });

  it("prices zero patas as zero", () => {
    expect(wholesaleLineTotal(0, 52500, 10)).toBe(0);
  });

  it("rejects a negative total or rate", () => {
    expect(() => wholesaleLineTotal(-1, 52500, 10)).toThrow("cannot be negative");
    expect(() => wholesaleLineTotal(10, -1, 10)).toThrow("cannot be negative");
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => wholesaleLineTotal(10, 52500, 0)).toThrow("patasPerBox must be at least 1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/saleTotals.test.ts`
Expected: FAIL with "wholesaleLineTotal is not a function" (or a module resolution error, since it isn't exported yet).

- [ ] **Step 3: Implement `wholesaleLineTotal`**

In `src/lib/saleTotals.ts`, add (reusing the file's existing private `assertWholeNonNegative`):

```ts
/**
 * Prices a wholesale line that may include a partial box (e.g. 10 boxes + 3
 * loose patas) as a single figure, rather than pricing the box portion and
 * the leftover patas separately.
 *
 * The leftover patas are priced as a fair fraction of the box rate — not the
 * separate (and usually higher) retail per-pata rate — so a buyer taking 10
 * boxes and 3 patas pays the same per-unit price on all 103 patas. Rounding
 * happens once, over the whole line's total patas, rather than rounding a
 * per-pata rate first and multiplying: that keeps a whole-box portion's
 * contribution exact and puts all the rounding error — at most half a paisa
 * either way — on the leftover patas alone.
 */
export function wholesaleLineTotal(
  totalPatas: number,
  boxPricePaisa: number,
  patasPerBox: number,
): number {
  assertWholeNonNegative(totalPatas, "totalPatas");
  assertWholeNonNegative(boxPricePaisa, "boxPricePaisa");
  if (!Number.isInteger(patasPerBox) || patasPerBox < 1) {
    throw new Error("patasPerBox must be at least 1");
  }
  // toFixed(4) before rounding for the same reason computeTotals's discount
  // math does it: binary floating point renders some exact products as
  // x.99999…, which a bare Math.round would take down to the wrong paisa.
  return Math.round(Number(((totalPatas * boxPricePaisa) / patasPerBox).toFixed(4)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/saleTotals.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the combined boxes+patas line in `writeWholesaleSale`**

Add to `tests/lib/writeWholesaleSale.test.ts` (the `run` helper's `items` parameter type needs `patas?: number` added — see Step 8):

```ts
it("prices a line with boxes and leftover patas together", async () => {
  const medicine = await makeMedicine(); // patasPerBox 10, boxPricePaisa 12000
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
  });
  // 23 total patas * 12000 / 10 = 27600 exactly.
  expect(sale!.totalPaisa).toBe(27600);
  expect(sale!.items[0].quantity).toBe(2);
  expect(sale!.items[0].leftoverPatas).toBe(3);
  expect(sale!.items[0].patasDeducted).toBe(23);
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(477);
});

it("treats a patas-only line (zero boxes) as billable", async () => {
  const medicine = await makeMedicine();
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 0, patas: 4 }],
  });
  expect(sale!.items[0].leftoverPatas).toBe(4);
  expect(sale!.totalPaisa).toBe(4800); // 4 * 12000 / 10
});

it("defaults patas to 0 when a caller omits it (order approval)", async () => {
  const medicine = await makeMedicine();
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 2 }],
  });
  expect(sale!.items[0].leftoverPatas).toBe(0);
  expect(sale!.totalPaisa).toBe(24000);
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts`
Expected: FAIL — `sale!.items[0].leftoverPatas` is `undefined`, and the boxes+patas line's total is computed from boxes alone.

- [ ] **Step 7: Implement — Sale schema, `writeWholesaleSale`, `sales.ts`**

In `src/models/Sale.ts`, add to `saleLineSchema` (after `patasDeducted`, before `form`):

```ts
// Leftover patas sold alongside `quantity` boxes on a wholesale line (e.g.
// 10 boxes + 3 patas). Always 0 for a retail line and for a wholesale line
// that is whole boxes only. See wholesaleLineTotal in src/lib/saleTotals.ts
// for how this and `quantity` together produce lineTotalPaisa.
leftoverPatas: { type: Number, required: true, default: 0, min: 0 },
```

In `src/lib/writeWholesaleSale.ts`:

```ts
export type WriteWholesaleSaleParams = {
  session: ClientSession;
  buyer: {
    id: mongoose.Types.ObjectId;
    name: string;
    shopName: string;
    phone: string;
  };
  items: { medicineId: string; boxes: number; patas?: number }[];
  discountPercent: number;
  paidPaisa: number;
  createdBy: string;
  orderId?: string | null;
};
```

```ts
import { boxesToPatas } from "@/lib/units";
import { applyStockDelta } from "@/lib/stockTransaction";
import { computeTotals, wholesaleLineTotal } from "@/lib/saleTotals";
```

This drops `lineTotal` from the import (Task 3 already dropped `unitLabelsFor` from this file). After this task's change below, `lineTotal`'s only call site in this file — the old `lineTotalPaisa: lineTotal({...})` — is replaced by `wholesaleLineTotal(...)`, so nothing in `writeWholesaleSale.ts` calls `lineTotal` any more.

```ts
if (!params.items.some((item) => item.boxes > 0 || (item.patas ?? 0) > 0)) {
  throw new Error("Onto ekta line e poriman dite hobe");
}

const lines = [];

for (const item of params.items) {
  const medicine = await MedicineModel.findById(item.medicineId).session(session);
  if (!medicine) throw new Error("Medicine pawa jay ni");

  const leftoverPatas = item.patas ?? 0;
  const totalPatas = boxesToPatas(item.boxes, medicine.patasPerBox) + leftoverPatas;

  if (totalPatas > 0) {
    const ok = await applyStockDelta(medicine._id, -totalPatas, session);
    if (!ok) throw new Error("Medicine pawa jay ni");
  }

  lines.push({
    medicineId: medicine._id,
    medicineName: medicine.name,
    form: medicine.form,
    unit: "box" as const,
    quantity: item.boxes,
    leftoverPatas,
    ratePaisa: medicine.boxPricePaisa,
    lineTotalPaisa: wholesaleLineTotal(totalPatas, medicine.boxPricePaisa, medicine.patasPerBox),
    patasDeducted: totalPatas,
  });
}

// computeTotals normally re-derives the subtotal itself, via
// ratePaisa * quantity per line — an assumption that breaks for a mixed
// box+pata line, where lineTotalPaisa is not ratePaisa * quantity. Passing
// quantity: 1 and ratePaisa: the line's own already-computed total sidesteps
// that: lineTotal(ratePaisa, 1) is just ratePaisa, so the sum reproduces
// exactly what was priced above, for every line, mixed or not.
const { subtotalPaisa, discountPaisa, totalPaisa, duePaisa } = computeTotals(
  lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
  params.discountPercent,
  params.paidPaisa,
);
```

The rest of `writeWholesaleSale` (settings/invoice-number lookup, `SaleModel.create`) is unchanged — `SaleModel.create` is called with `items: lines`, so the new `leftoverPatas` key on each pushed line object is picked up automatically.

In `src/actions/sales.ts`:

```ts
export type WholesaleSaleInput = {
  buyerId: string;
  items: { medicineId: string; boxes: number; patas: number }[];
  discountPercent: number;
  paidPaisa: number;
};
```

In `validateWholesale`, alongside the existing `boxes` check:

```ts
for (const item of input.items) {
  if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
    throw new Error("Medicine pawa jay ni");
  }
  if (
    typeof item.boxes !== "number" ||
    !Number.isInteger(item.boxes) ||
    item.boxes < 0
  ) {
    throw new Error("Poriman 0 er kom hote parbe na");
  }
  if (
    typeof item.patas !== "number" ||
    !Number.isInteger(item.patas) ||
    item.patas < 0
  ) {
    throw new Error("Poriman 0 er kom hote parbe na");
  }
  if (seen.has(item.medicineId)) {
    throw new Error("Ekta medicine ekbar er beshi cart e dewa jabe na");
  }
  seen.add(item.medicineId);
}
```

(No check that `patas < patasPerBox` — the client rolls leftover patas into boxes before submitting as a UX nicety, but the total-patas math here is correct regardless, so the server does not need to re-enforce it.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts`
Expected: PASS.

- [ ] **Step 9: Write failing tests for `validateWholesale`'s new `patas` validation**

Add to `tests/actions/sales.test.ts` near the existing wholesale validation tests:

```ts
it("rejects a negative patas quantity", async () => {
  const medicine = await makeMedicine();
  const buyerDoc = await makeBuyer();
  await expect(
    unwrap(recordWholesaleSale({
      buyerId: String(buyerDoc._id),
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: -1 }],
      discountPercent: 0,
      paidPaisa: 0,
    })),
  ).rejects.toThrow("Poriman 0 er kom hote parbe na");
});

it("rejects a fractional patas quantity", async () => {
  const medicine = await makeMedicine();
  const buyerDoc = await makeBuyer();
  await expect(
    unwrap(recordWholesaleSale({
      buyerId: String(buyerDoc._id),
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 1.5 }],
      discountPercent: 0,
      paidPaisa: 0,
    })),
  ).rejects.toThrow("Poriman 0 er kom hote parbe na");
});
```

`makeMedicine` and `makeBuyer` are module-level helpers already defined at the top of `tests/actions/sales.test.ts` (lines 40 and 46) and reused across both the retail and wholesale `describe` blocks — the code above uses them as they already exist, no new helper needed.

- [ ] **Step 10: Run, verify fail, then verify pass**

Run: `npx vitest run tests/actions/sales.test.ts`
Expected: FAIL first (patas isn't validated yet — but Step 8 already added the validation, so if Step 8 was done correctly this should already PASS; if it fails, the validation from Step 8 is missing or misplaced — fix it there, not by adding new logic here).

- [ ] **Step 11: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/models/Sale.ts src/lib/saleTotals.ts src/lib/writeWholesaleSale.ts src/actions/sales.ts tests/lib/saleTotals.test.ts tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts
git commit -m "feat: price a wholesale line's boxes and leftover patas as one"
```

---

## Task 5: `WholesaleSaleForm` — box + leftover-patas cart lines

**Files:**
- Modify: `src/components/WholesaleSaleForm.tsx`

**Interfaces:**
- Consumes: `wholesaleLineTotal`, `computeTotals` from `src/lib/saleTotals.ts`; `recordWholesaleSale` from `src/actions/sales.ts` (now takes `items[].patas`)

This task has no server-side logic and no `.test.ts` coverage in this codebase's convention — it is implemented directly and checked with a build/typecheck plus a manual browser pass (Step 3).

- [ ] **Step 1: Implement**

In `src/components/WholesaleSaleForm.tsx`:

```ts
type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
  patas: number;
};
```

```ts
import { computeTotals, wholesaleLineTotal } from "@/lib/saleTotals";
```

Replace the subtotal calculation:

```ts
function lineTotalFor(line: CartLine): number {
  const totalPatas = line.boxes * line.medicine.patasPerBox + line.patas;
  return wholesaleLineTotal(totalPatas, line.medicine.boxPricePaisa, line.medicine.patasPerBox);
}

const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
const hasBillableLine = cart.some((line) => line.boxes > 0 || line.patas > 0);
```

Replace the `computeTotals` call to price via each line's own already-rounded total (same trick as `writeWholesaleSale`, so the preview matches the server exactly):

```ts
try {
  const totals = computeTotals(
    cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
    discountPercent,
    paidPaisa,
  );
  discountPaisa = totals.discountPaisa;
  totalPaisa = totals.totalPaisa;
  duePaisa = totals.duePaisa;
} catch (err) {
  totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
}
```

Update `addMedicine` to initialise `patas: 0`:

```ts
function addMedicine(medicine: PickedMedicine) {
  if (cart.some((l) => l.medicine.id === medicine.id)) return;
  setLastInvoice(null);
  setCart((prev) => [...prev, { medicine, boxes: 1, patas: 0 }]);
}
```

Add the roll-up handler alongside the existing `updateBoxes`:

```ts
// Whatever is typed here becomes the line's leftover-patas figure; if it is
// patasPerBox or more, the extra whole boxes are folded into `boxes` so the
// displayed leftover always stays under one box. Re-typing the same large
// number again is a deliberate "add another box" — the field always shows
// the already-rolled-up leftover, never the raw number last typed.
function updatePatas(idx: number, raw: string) {
  setCart((prev) =>
    prev.map((line, i) => {
      if (i !== idx) return line;
      const entered = parseQuantityInput(raw, 0);
      const patasPerBox = line.medicine.patasPerBox;
      return {
        ...line,
        boxes: line.boxes + Math.floor(entered / patasPerBox),
        patas: entered % patasPerBox,
      };
    }),
  );
}
```

Update the cart table's "Poriman" cell to show both inputs:

```tsx
<td className={td}>
  <div className="flex items-center gap-1.5">
    <input
      type="number"
      min={0}
      value={line.boxes}
      onChange={(e) => updateBoxes(idx, e.target.value)}
      className="w-16 rounded border border-line px-2 py-1 text-sm"
    />
    <span className="text-xs text-muted">{unitLabelsFor(line.medicine.form).outer}</span>
    <input
      type="number"
      min={0}
      value={line.patas}
      onChange={(e) => updatePatas(idx, e.target.value)}
      className="w-16 rounded border border-line px-2 py-1 text-sm"
    />
    <span className="text-xs text-muted">{unitLabelsFor(line.medicine.form).inner}</span>
  </div>
  {line.boxes === 0 && line.patas === 0 && (
    <div className="text-[11px] font-medium text-muted">
      invoice e thakbe, dam nai
    </div>
  )}
</td>
<td className={`${td} text-right font-medium text-ink`}>
  {formatTaka(lineTotalFor(line))}
</td>
```

(This replaces both the old single-input "Poriman" cell and the old "Mot" cell's `formatTaka(line.medicine.boxPricePaisa * line.boxes)`.)

Update the submit payload:

```ts
const result = await recordWholesaleSale({
  buyerId,
  items: cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas })),
  discountPercent: Number(discount || 0),
  paidPaisa: Math.round(takaToPaisa(paid || 0)),
});
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean — this task touches no test files, so this step is purely a regression check.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`npm run dev`), log in, go to Wholesale Bikri:
- Add a medicine, set boxes to 2 and patas to 13 with `patasPerBox` 10 — confirm the row rolls up to boxes 3, patas 3, and the row total matches `wholesaleLineTotal(33, boxPricePaisa, patasPerBox)`.
- Set both boxes and patas to 0 on a line — confirm the "invoice e thakbe, dam nai" hint appears and the line is excluded from `hasBillableLine`.
- Confirm a sale with only patas (0 boxes, e.g. 4 patas) is billable and submits successfully.
- Submit a sale that exceeds current stock — confirm it completes (Task 3) rather than erroring.

- [ ] **Step 4: Commit**

```bash
git add src/components/WholesaleSaleForm.tsx
git commit -m "feat: sell wholesale in boxes plus leftover patas"
```

---

## Task 6: Invoice shows "X box Y pata"

**Files:**
- Modify: `src/components/Invoice.tsx`
- Modify: `src/app/(admin)/invoice/[id]/page.tsx`

**Interfaces:**
- Consumes: `sale.items[].leftoverPatas` (from Task 4's schema change)

- [ ] **Step 1: Implement**

In `src/components/Invoice.tsx`, add `leftoverPatas?: number` to the `items` entry in `InvoiceProps`:

```ts
items: {
  medicineName: string;
  unit: string;
  form?: string;
  quantity: number;
  leftoverPatas?: number;
  ratePaisa: number;
  lineTotalPaisa: number;
}[];
```

Add a small formatter above the component (single use site, kept local rather than exported):

```ts
/**
 * A wholesale line's quantity, e.g. "10bx 3pt". `leftoverPatas` is absent or
 * 0 on every retail line and on a wholesale line that is whole boxes only,
 * so the old "10bx" rendering is what those keep showing.
 */
function formatWholesaleQty(
  boxes: number,
  leftoverPatas: number,
  outerShort: string,
  innerShort: string,
): string {
  if (boxes === 0 && leftoverPatas === 0) return `0${outerShort}`;
  const parts: string[] = [];
  if (boxes > 0) parts.push(`${boxes}${outerShort}`);
  if (leftoverPatas > 0) parts.push(`${leftoverPatas}${innerShort}`);
  return parts.join(" ");
}
```

Update the Qty cell and the zero-line blanking check (a line with 0 boxes but nonzero `leftoverPatas` is billable, not the "ordered, not supplied" zero case):

```tsx
{items.map((item, idx) => {
  const labels = unitLabelsFor(item.form);
  const leftoverPatas = item.leftoverPatas ?? 0;
  const isZeroLine = item.unit === "box"
    ? item.quantity === 0 && leftoverPatas === 0
    : item.quantity === 0;
  return (
    <tr key={idx} className="border-b border-dashed border-slate-200">
      <td className="py-1 pr-1">{item.medicineName}</td>
      <td className="py-1 text-right">
        {item.unit === "box"
          ? formatWholesaleQty(item.quantity, leftoverPatas, labels.outerShort, labels.innerShort)
          : `${item.quantity}${labels.innerShort}`}
      </td>
      <td className="py-1 text-right">
        {isZeroLine ? "" : formatTaka(item.ratePaisa)}
      </td>
      <td className="py-1 text-right">
        {isZeroLine ? "" : formatTaka(item.lineTotalPaisa)}
      </td>
    </tr>
  );
})}
```

In `src/app/(admin)/invoice/[id]/page.tsx`, add `leftoverPatas` to the item mapping passed into `<Invoice>`:

```ts
items={sale.items.map((item) => ({
  medicineName: item.medicineName,
  unit: item.unit,
  form: item.form,
  quantity: item.quantity,
  leftoverPatas: item.leftoverPatas,
  ratePaisa: item.ratePaisa,
  lineTotalPaisa: item.lineTotalPaisa,
}))}
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 3: Manual browser verification**

Print (or preview) an invoice for a sale recorded in Task 5 with a mixed box+pata line — confirm the Qty column reads e.g. "3bx 3pt" and the Rate/Amt columns show the combined price, not two separate rows. Confirm an older, pre-existing wholesale sale (whole boxes only, `leftoverPatas` absent) still renders exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/Invoice.tsx "src/app/(admin)/invoice/[id]/page.tsx"
git commit -m "feat: show a wholesale invoice line's leftover patas"
```

---

## Task 7: `RetailSaleForm` drops its stock ceiling

**Files:**
- Modify: `src/components/RetailSaleForm.tsx:186-198`

- [ ] **Step 1: Implement**

Remove the `max` attribute (a soft cap that no longer reflects a real ceiling now that a sale can exceed stock) but keep `min={1}`:

```tsx
<input
  type="number"
  min={1}
  value={line.patas}
  onChange={(e) => updatePatas(idx, e.target.value)}
  className="w-20 rounded border border-line px-2 py-1 text-sm"
/>
<span className="ml-1 text-xs text-muted">
  {unitLabelsFor(line.medicine.form).inner} /{" "}
  {line.medicine.stockPatas}
</span>
```

(The `/ {stockPatas}` label stays — it is informational, not a constraint, and still useful context even when it can now be negative, which `formatStock`... actually this is a raw number, not run through `formatStock` — it will print e.g. `/ -4` as-is, which is legible and requires no further change.)

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 3: Manual browser verification**

At Khuchra Bikri, add a medicine whose stock is low (or already negative from a prior test), and confirm the pata input no longer refuses a value above the on-hand count (previously the browser's native `max` would have shown a validation bubble).

- [ ] **Step 4: Commit**

```bash
git add src/components/RetailSaleForm.tsx
git commit -m "fix: drop the retail quantity's stock ceiling now that stock can go negative"
```

---

## Task 8: Negative stock renders as a visible warning

**Files:**
- Modify: `src/components/MedicinePicker.tsx:97-105`
- Modify: `src/components/DashboardCards.tsx:89-91`

**Interfaces:**
- Consumes: `formatStock` from Task 1 (no longer throws on negative)

`MedicineTable.tsx` needs **no code change** — its existing `low` styling (`row.stockPatas <= row.lowStockThreshold`, `src/components/MedicineTable.tsx:95,109`) already renders red for any stock at or under the threshold, and since `lowStockThreshold` is never negative (schema `min: 0`), any negative `stockPatas` already satisfies `<=` and already renders red. This task only verifies that (Step 3) — the crash it would previously have hit came from `formatStock` throwing, which Task 1 already fixed.

- [ ] **Step 1: Implement**

In `src/components/MedicinePicker.tsx`, style the stock figure in the results dropdown:

```tsx
<span
  className={`shrink-0 text-xs font-medium ${
    medicine.stockPatas < 0 ? "text-danger" : "text-muted"
  }`}
>
  {formatStock(medicine.stockPatas, medicine.patasPerBox, medicine.form)}
</span>
```

In `src/components/DashboardCards.tsx`, the "Stock In menu theke notun maal dhukao" hint (line 90) references a menu Task 11 removes — update it to point at the medicine form instead:

```tsx
<p className="mt-2 text-xs text-muted">
  Medicine edit korte giye notun maal dhukao.
</p>
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 3: Manual browser verification**

With a medicine already driven negative (from Task 5/7's manual checks), confirm: its row in `/medicines` shows red stock text; typing its name into any `MedicinePicker` (wholesale or retail cart) shows the negative figure in red in the dropdown.

- [ ] **Step 4: Commit**

```bash
git add src/components/MedicinePicker.tsx src/components/DashboardCards.tsx
git commit -m "feat: show negative stock in red wherever it's displayed"
```

---

## Task 9: `listStockEntries` filters to one medicine

**Files:**
- Modify: `src/actions/stock.ts:117-127`
- Test: `tests/actions/stock.test.ts:228-239`

**Interfaces:**
- Produces: `listStockEntries(medicineId?: string, limit = 50): Promise<Serialized<StockEntryDoc>[]>` (was `listStockEntries(limit = 50)`)

- [ ] **Step 1: Write the failing test**

Add to the `describe("listStockEntries", ...)` block in `tests/actions/stock.test.ts`:

```ts
it("filters to a single medicine when given an id", async () => {
  const a = await unwrap(createMedicine(napa));
  const b = await unwrap(createMedicine({ ...napa, name: "Ace" }));
  await unwrap(stockIn({ medicineId: String(a._id), boxes: 1, note: "" }));
  await unwrap(stockIn({ medicineId: String(b._id), boxes: 2, note: "" }));
  await unwrap(stockIn({ medicineId: String(a._id), boxes: 3, note: "" }));

  const entries = await listStockEntries(String(a._id));
  expect(entries).toHaveLength(2);
  expect(entries.every((e) => e.medicineId === String(a._id))).toBe(true);
});

it("returns every medicine's entries when no id is given, unchanged from before", async () => {
  const a = await unwrap(createMedicine(napa));
  const b = await unwrap(createMedicine({ ...napa, name: "Ace" }));
  await unwrap(stockIn({ medicineId: String(a._id), boxes: 1, note: "" }));
  await unwrap(stockIn({ medicineId: String(b._id), boxes: 2, note: "" }));

  const entries = await listStockEntries();
  expect(entries).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/actions/stock.test.ts`
Expected: FAIL — `listStockEntries(String(a._id))` currently ignores its argument (there isn't one; the first positional arg is `limit`, so `String(a._id)` would be coerced badly by `.limit(term)` — this will error or return wrong results).

- [ ] **Step 3: Implement**

In `src/actions/stock.ts`:

```ts
export async function listStockEntries(
  medicineId?: string,
  limit = 50,
): Promise<Serialized<StockEntryDoc>[]> {
  await requireAdminAction();
  await connectDb();

  const filter: Record<string, unknown> = {};
  if (medicineId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(medicineId)) return [];
    filter.medicineId = medicineId;
  }

  const docs = await StockEntryModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<StockEntryDoc[]>();
  return toPlainList(docs);
}
```

(An invalid `medicineId` returns `[]` rather than throwing — this will be called from the medicine edit form with `initial.id`, which is always a real id once a medicine exists, but returning empty rather than a raw CastError is the same defensive convention used elsewhere in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/actions/stock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/stock.ts tests/actions/stock.test.ts
git commit -m "feat: let listStockEntries filter to one medicine"
```

---

## Task 10: Stock-in moves into the medicine form

**Files:**
- Modify: `src/components/MedicineForm.tsx`

**Interfaces:**
- Consumes: `stockIn` and `listStockEntries` (from Task 9) from `src/actions/stock.ts`; `createMedicine`/`updateMedicine` (unchanged, from `src/actions/medicines.ts`)

No new test file — this is a UI composition of two already-tested actions (`stockIn`, `listStockEntries`), verified by typecheck, the full suite, and a manual browser pass.

- [ ] **Step 1: Implement**

In `src/components/MedicineForm.tsx`, add imports and state:

```ts
import { useState, useEffect } from "react";
import { stockIn, listStockEntries } from "@/actions/stock";
import { boxesToPatas, formatStock } from "@/lib/units";
import type { StockEntryDoc } from "@/models/StockEntry";
import type { Serialized } from "@/lib/serialize";
```

```ts
const [stockBoxes, setStockBoxes] = useState("");
const [stockNote, setStockNote] = useState("");
const [stockEntries, setStockEntries] = useState<Serialized<StockEntryDoc>[]>([]);
```

Fetch this medicine's stock-in history on mount, only in edit mode:

```ts
useEffect(() => {
  if (!initial?.id) return;
  let cancelled = false;
  listStockEntries(initial.id).then((entries) => {
    if (!cancelled) setStockEntries(entries);
  });
  return () => {
    cancelled = true;
  };
}, [initial?.id]);
```

Sequence the stock-in call after a successful create or update, inside `handleSubmit`, right before `router.refresh(); onDone();`:

```ts
if (!result.ok) {
  setError(result.error);
  setBusy(false);
  return;
}

const targetId = initial?.id ?? result.data._id;
const boxesToAdd = Number(stockBoxes);
if (stockBoxes.trim() !== "" && Number.isInteger(boxesToAdd) && boxesToAdd > 0) {
  const stockResult = await stockIn({
    medicineId: targetId,
    boxes: boxesToAdd,
    note: stockNote,
  });
  if (!stockResult.ok) {
    setError(stockResult.error);
    setBusy(false);
    return;
  }
}

router.refresh();
onDone();
```

(`result.data._id` exists because both `createMedicine` and `updateMedicine` return the saved medicine — confirmed in `src/actions/medicines.ts:132,168`.)

`MedicineFormValues` (the `initial` prop's type) does not carry `stockPatas` — only `MedicineRow` (`src/components/MedicineTable.tsx:21-24`, which extends it) does, and `MedicineRow` is the only type `MedicineTable.tsx` ever passes as `initial`. Widen the prop type before touching the JSX, so the history section below can read `initial?.stockPatas` directly with no cast:

```ts
export function MedicineForm({
  initial,
  onDone,
}: {
  initial?: MedicineFormValues & { stockPatas?: number };
  onDone: () => void;
}) {
```

Add the "Stock add koro" section to the JSX, after the existing field grid and before the error/button row:

```tsx
<div className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
  <h3 className="text-sm font-semibold text-ink">Stock add koro</h3>
  {initial?.id && (
    <p className="text-xs text-muted">
      Ekhon ache: {formatStock(initial.stockPatas ?? 0, Number(patasPerBox) || 1, form)}
    </p>
  )}
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1.5">
      <label htmlFor="stockBoxes" className={labelCls}>
        Koto {labels.outer} dhuklo
      </label>
      <input id="stockBoxes" type="number" min={0} className={input}
        value={stockBoxes} onChange={(e) => setStockBoxes(e.target.value)} />
      {stockBoxes && Number.isInteger(Number(stockBoxes)) && Number(stockBoxes) > 0 && (
        <p className="text-xs text-muted">
          = {boxesToPatas(Number(stockBoxes), Number(patasPerBox) || 1)} {labels.inner}
        </p>
      )}
    </div>
    <div className="space-y-1.5">
      <label htmlFor="stockNote" className={labelCls}>Note (optional)</label>
      <input id="stockNote" className={input} value={stockNote}
        onChange={(e) => setStockNote(e.target.value)} />
    </div>
  </div>
</div>

{initial?.id && stockEntries.length > 0 && (
  <div className="space-y-1.5">
    <h3 className="text-sm font-semibold text-ink">Ager stock entry</h3>
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            <th className="p-2">Date</th>
            <th className="p-2">Pack</th>
            <th className="p-2">Unit</th>
            <th className="p-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {stockEntries.map((entry) => (
            <tr key={entry._id} className="border-b border-line">
              <td className="p-2 text-muted">
                {new Date(entry.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
              </td>
              <td className="p-2">{entry.boxes} {labels.outer}</td>
              <td className="p-2 text-muted">{entry.patasAdded} {labels.inner}</td>
              <td className="p-2 text-muted">{entry.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 3: Manual browser verification**

Create a new medicine, enter 5 in "Stock add koro", save — confirm the medicine list shows 50 patas of stock (at `patasPerBox` 10) and a `StockEntry` was written (check `/medicines`, then edit it back open and confirm the history table shows one row). Edit an existing medicine, add more stock, confirm the running total and history update. Leave "Stock add koro" blank on both create and edit — confirm no `StockEntry` is written and stock is unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/components/MedicineForm.tsx
git commit -m "feat: add stock from the medicine form instead of a separate page"
```

---

## Task 11: Remove the old Stock In page and nav links

**Files:**
- Delete: `src/app/(admin)/stock/page.tsx`
- Delete: `src/components/StockInForm.tsx`
- Modify: `src/components/AdminNav.tsx:14` (remove the `/stock` entry from `LINKS`)
- Modify: `src/components/AdminBottomNav.tsx:19` (remove the `/stock` entry from `MORE`)
- Test: `tests/actions/stock.test.ts` (no change expected — confirm `stockIn`/`listStockEntries` tests still pass with no page in front of them; they already call the actions directly)

- [ ] **Step 1: Delete the page and component**

```bash
git rm "src/app/(admin)/stock/page.tsx" src/components/StockInForm.tsx
```

- [ ] **Step 2: Remove the nav entries**

In `src/components/AdminNav.tsx`, remove `{ href: "/stock", label: "Stock In" },` from `LINKS`.

In `src/components/AdminBottomNav.tsx`, remove `{ href: "/stock", label: "Stock In" },` from `MORE`.

- [ ] **Step 3: Grep for any remaining reference**

Run: `grep -rn "StockInForm\|/stock\"" src`

Expected: no matches other than unrelated strings (double-check anything matched is not actually a dangling import or link — `src/actions/stock.ts` itself and its two exported functions are untouched and still used by `MedicineForm.tsx`, so `stock.ts`/`stock.test.ts` are not part of this deletion).

- [ ] **Step 4: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean — deleting a page that nothing imports should not affect any test, since `tests/actions/stock.test.ts` calls `stockIn`/`listStockEntries` directly, never through the page.

- [ ] **Step 5: Manual browser verification**

Confirm `/stock` 404s. Confirm neither the desktop top nav nor the mobile bottom-nav "More" drawer lists "Stock In" any more. Confirm the medicine form's "Stock add koro" section (Task 10) is still there and still works.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove the standalone Stock In page, now folded into the medicine form"
```

---

## Verification (whole plan)

After all 11 tasks:

- [ ] `npx tsc --noEmit` — clean
- [ ] `npx vitest run` — full suite passes
- [ ] Browser walkthrough, in order: restock a medicine from its edit page and see the history table update (Task 10); sell a mixed box+pata wholesale line and check the invoice math (Tasks 4-6); oversell a medicine on purpose (retail and wholesale) and confirm the sale completes with the medicine table showing red negative stock (Tasks 2-3, 8); stock it back up and confirm the red clears at the right number (Task 2's arithmetic, Task 1's display); confirm `/stock` is gone and nothing links to it (Task 11)
