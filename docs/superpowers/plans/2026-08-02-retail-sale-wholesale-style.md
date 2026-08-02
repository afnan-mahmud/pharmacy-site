# Retail Sale Rebuilt On The Wholesale Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the retail (khuchra) counter on the wholesale flow's two-step medicine picker, add a dual percent/amount discount, partial payment with a phone-keyed due ledger, and printable invoices for retail sales.

**Architecture:** Generalize the shared money engine (`computeTotals`) and line-builder (extracted from `writeWholesaleSale`) so both sale types call one definition each. Add a `RetailCustomer`/`RetailPayment` data model (phone-keyed, mirroring `Buyer`/`Payment`) and a `writeRetailSale` lib function parallel to `writeWholesaleSale`. Extract the wholesale form's step-1 picker into a shared `SaleItemPicker` component and rebuild `RetailSaleForm` as a two-step form on top of it.

**Tech Stack:** Next.js App Router + TypeScript, MongoDB/Mongoose (multi-document transactions), Vitest + mongodb-memory-server, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-02-retail-sale-wholesale-style-design.md`

## Global Constraints

- Money is always integer paisa, never floats. Stock is always integer patas.
- Every stock change goes through `applyStockDelta` (src/lib/stockTransaction.ts).
- Every Server Action calls `requireAdminAction()` as its first line, before touching any argument (structurally enforced by `tests/actions/authorization.test.ts`, which sweeps `src/actions/*.ts` — no new action module is being added in this plan, so its pinned module-path list does not need updating).
- All user-facing strings are Banglish (Bengali in Latin letters), never Bengali script.
- Follow existing patterns: `ActionResult<T>` for mutating actions (src/lib/actionResult.ts), `Serialized<T>`/`toPlain`/`toPlainList` for anything crossing the server→client boundary (src/lib/serialize.ts), `card`/`input`/`btnPrimary`/table tokens from `src/components/ui.ts` for new UI.
- This codebase has no component-level (React) tests — only lib/action/model tests. UI tasks are verified by browser check, not a test file.
- Run `npx vitest run <file>` after every test-writing step. Do not move on with a red test.
- **Known pre-existing failures on `main` (unrelated to this feature, discovered while researching this plan):** `tests/actions/adminOrders.test.ts`, `tests/actions/authorization.test.ts` (one case), `tests/actions/buyerOrders.test.ts`, `tests/actions/medicines.test.ts`, `tests/lib/stockStatus.test.ts`, `tests/models/Order.test.ts` are already red on `main` before this plan starts. **Do not fix these** — out of scope. Two other pre-existing failures, in `tests/lib/saleTotals.test.ts` and `tests/actions/sales.test.ts`, **are** in scope because they're stale assertions in files this plan rewrites anyway — Tasks 1 and 6 fix them as part of the rewrite.

---

### Task 1: `computeTotals` takes a percent-or-amount discount

**Files:**
- Modify: `src/lib/saleTotals.ts`
- Test: `tests/lib/saleTotals.test.ts` (full rewrite)

**Interfaces:**
- Produces: `DiscountInput = { kind: "percent"; percent: number } | { kind: "amount"; amountPaisa: number }`, and `computeTotals(lines: SaleLine[], discount: DiscountInput, paidPaisa: number): { subtotalPaisa: number; discountPercent: number; discountPaisa: number; totalPaisa: number; duePaisa: number }`.

Current `computeTotals(lines, discountPercent: number, paidPaisa)` takes a bare percent. Two existing tests (`rejects paid greater than the total`, `counts the discount when checking the paid amount`) already fail on `main` — the function's actual behavior (per its own doc comment) is to allow `paidPaisa` to exceed the total, producing a negative `duePaisa` (credit), not to reject it. Fix those two tests as part of this rewrite rather than re-adding a rejection that contradicts the documented, intended behavior.

- [ ] **Step 1: Write the new `saleTotals.ts`**

```ts
/**
 * The money arithmetic for a sale, in integer paisa throughout.
 *
 * Kept free of any database or framework dependency so the rules that decide
 * what a customer owes can be tested on their own, and so the retail and
 * wholesale actions cannot drift into two different definitions of "total".
 */

export type SaleLine = {
  ratePaisa: number;
  quantity: number;
};

/**
 * A discount is either a percentage of the subtotal or a flat paisa amount —
 * never both at once. The retail counter lets the owner type into either box
 * (see RetailSaleForm); whichever one they used is what this carries.
 */
export type DiscountInput =
  | { kind: "percent"; percent: number }
  | { kind: "amount"; amountPaisa: number };

function assertWholeNonNegative(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

export function lineTotal(line: SaleLine): number {
  assertWholeNonNegative(line.ratePaisa, "ratePaisa");
  assertWholeNonNegative(line.quantity, "quantity");
  return line.ratePaisa * line.quantity;
}

/**
 * A discount is a percentage, not an amount — the owner thinks "10% off this
 * shop", not "৳63.10 off". Unlike every other money figure here it may be
 * fractional, so it gets its own guard instead of assertWholeNonNegative.
 */
function assertDiscountPercent(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Discount thik nai");
  }
  if (value < 0) {
    throw new Error("Discount 0 er kom hote parbe na");
  }
  if (value > 100) {
    throw new Error("Discount 100% er beshi hote parbe na");
  }
}

/**
 * Computes a discount already expressed as a flat paisa amount. Unlike the
 * percent branch, no rounding step turns the input into discountPaisa — the
 * amount the owner typed is exactly what comes off, so the screen and the
 * invoice can never disagree by a paisa over what they entered.
 * discountPercent is derived purely for display/record; nothing recomputes
 * money from it.
 */
function amountDiscount(
  amountPaisa: number,
  subtotalPaisa: number,
): { discountPercent: number; discountPaisa: number } {
  if (typeof amountPaisa !== "number" || !Number.isInteger(amountPaisa)) {
    throw new Error("Discount thik nai");
  }
  if (amountPaisa < 0) {
    throw new Error("Discount 0 er kom hote parbe na");
  }
  if (amountPaisa > subtotalPaisa) {
    throw new Error("Discount subtotal er beshi hote parbe na");
  }
  const discountPercent =
    subtotalPaisa > 0
      ? Math.round((amountPaisa / subtotalPaisa) * 100 * 100) / 100
      : 0;
  return { discountPercent, discountPaisa: amountPaisa };
}

/**
 * Takes the discount (percent or flat amount) and returns the paisa it works
 * out to, alongside the totals.
 *
 * Returning `discountPaisa` (and, now, `discountPercent`) is the point: a
 * percent-to-paisa conversion involves a rounding step, and an amount-to-
 * percent conversion involves the reverse — if the form previewed one
 * rounding while the action computed another, the screen and the invoice
 * would disagree about what the customer owes. Every caller stores what this
 * returns rather than doing the arithmetic itself, so there is only ever one
 * answer.
 */
export function computeTotals(
  lines: SaleLine[],
  discount: DiscountInput,
  paidPaisa: number,
): {
  subtotalPaisa: number;
  discountPercent: number;
  discountPaisa: number;
  totalPaisa: number;
  duePaisa: number;
} {
  assertWholeNonNegative(paidPaisa, "paidPaisa");

  const subtotalPaisa = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  let discountPercent: number;
  let discountPaisa: number;

  if (discount.kind === "percent") {
    assertDiscountPercent(discount.percent);
    discountPercent = discount.percent;
    // toFixed(4) before rounding for the same reason takaToPaisa does it
    // (see src/lib/money.ts): binary floating point renders some exact
    // products as x.99999…, which a bare Math.round would take down to the
    // wrong paisa.
    discountPaisa = Math.round(
      Number(((subtotalPaisa * discount.percent) / 100).toFixed(4)),
    );
  } else {
    const derived = amountDiscount(discount.amountPaisa, subtotalPaisa);
    discountPercent = derived.discountPercent;
    discountPaisa = derived.discountPaisa;
  }

  const totalPaisa = subtotalPaisa - discountPaisa;

  // duePaisa may be negative when paidPaisa exceeds the total. A negative
  // value means the buyer has credit — money the pharmacy owes back. This
  // surfaces in the ledger as "Joma ache" (see src/lib/dueDisplay.ts) and is
  // automatically offset against future purchases.
  return {
    subtotalPaisa,
    discountPercent,
    discountPaisa,
    totalPaisa,
    duePaisa: totalPaisa - paidPaisa,
  };
}
```

- [ ] **Step 2: Replace `tests/lib/saleTotals.test.ts` in full**

```ts
import { describe, it, expect } from "vitest";
import { lineTotal, computeTotals } from "@/lib/saleTotals";

describe("lineTotal", () => {
  it("multiplies rate by quantity", () => {
    expect(lineTotal({ ratePaisa: 1200, quantity: 3 })).toBe(3600);
  });

  it("handles a zero quantity", () => {
    expect(lineTotal({ ratePaisa: 1200, quantity: 0 })).toBe(0);
  });

  it("rejects a fractional rate", () => {
    expect(() => lineTotal({ ratePaisa: 12.5, quantity: 1 })).toThrow(
      "ratePaisa must be a whole number",
    );
  });

  it("rejects a fractional quantity", () => {
    expect(() => lineTotal({ ratePaisa: 1200, quantity: 1.5 })).toThrow(
      "quantity must be a whole number",
    );
  });

  it("rejects a negative rate", () => {
    expect(() => lineTotal({ ratePaisa: -1, quantity: 1 })).toThrow(
      "ratePaisa cannot be negative",
    );
  });
});

describe("computeTotals — percent discount", () => {
  const lines = [
    { ratePaisa: 12000, quantity: 3 }, // 36000
    { ratePaisa: 1400, quantity: 5 }, // 7000
  ]; // subtotal 43000

  const percent = (p: number) => ({ kind: "percent" as const, percent: p });

  it("sums the lines into the subtotal", () => {
    const { subtotalPaisa } = computeTotals(lines, percent(0), 0);
    expect(subtotalPaisa).toBe(43000);
  });

  it("leaves the subtotal untouched by the discount", () => {
    expect(computeTotals(lines, percent(25), 0).subtotalPaisa).toBe(43000);
  });

  it("takes a whole percent off the subtotal", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(10), 0);
    expect(discountPaisa).toBe(4300);
    expect(totalPaisa).toBe(38700);
  });

  it("accepts a fractional percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(2.5), 0);
    expect(discountPaisa).toBe(1075);
    expect(totalPaisa).toBe(41925);
  });

  it("rounds an uneven percent to the nearest paisa", () => {
    expect(computeTotals(lines, percent(7.77), 0).discountPaisa).toBe(3341);
  });

  it("rounds a half paisa up", () => {
    expect(
      computeTotals([{ ratePaisa: 4300, quantity: 1 }], { kind: "percent", percent: 1.5 }, 0)
        .discountPaisa,
    ).toBe(65);
  });

  it("is not defeated by floating point", () => {
    expect(
      computeTotals([{ ratePaisa: 100499, quantity: 1 }], { kind: "percent", percent: 1 }, 0)
        .discountPaisa,
    ).toBe(1005);
  });

  it("reports no discount at zero percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(0), 0);
    expect(discountPaisa).toBe(0);
    expect(totalPaisa).toBe(43000);
  });

  it("wipes out the total at a hundred percent", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, percent(100), 0);
    expect(discountPaisa).toBe(43000);
    expect(totalPaisa).toBe(0);
  });

  it("keeps the discount and the total consistent", () => {
    const t = computeTotals(lines, percent(13.5), 0);
    expect(t.totalPaisa).toBe(t.subtotalPaisa - t.discountPaisa);
  });

  it("echoes the percent it was given", () => {
    expect(computeTotals(lines, percent(13.5), 0).discountPercent).toBe(13.5);
  });

  it("computes the due as total minus paid", () => {
    const { duePaisa } = computeTotals(lines, percent(10), 25000);
    expect(duePaisa).toBe(13700);
  });

  it("reports zero due when paid in full", () => {
    const { duePaisa } = computeTotals(lines, percent(0), 43000);
    expect(duePaisa).toBe(0);
  });

  it("produces a negative due (credit) when paid exceeds the total", () => {
    const { duePaisa } = computeTotals(lines, percent(0), 50000);
    expect(duePaisa).toBe(-7000);
  });

  it("counts the discount before computing a credit", () => {
    // 10% off 43000 leaves 38700; paying 40000 overshoots by 1300.
    const { duePaisa } = computeTotals(lines, percent(10), 40000);
    expect(duePaisa).toBe(-1300);
  });

  it("handles an empty sale", () => {
    expect(computeTotals([], percent(0), 0)).toEqual({
      subtotalPaisa: 0,
      discountPercent: 0,
      discountPaisa: 0,
      totalPaisa: 0,
      duePaisa: 0,
    });
  });

  it("rejects a percent above a hundred", () => {
    expect(() => computeTotals(lines, percent(101), 0)).toThrow(
      "Discount 100% er beshi hote parbe na",
    );
  });

  it("rejects a negative percent", () => {
    expect(() => computeTotals(lines, percent(-1), 0)).toThrow(
      "Discount 0 er kom hote parbe na",
    );
  });

  it("rejects a percent that is not a finite number", () => {
    expect(() => computeTotals(lines, percent(NaN), 0)).toThrow("Discount thik nai");
    expect(() => computeTotals(lines, percent(Infinity), 0)).toThrow("Discount thik nai");
    expect(() =>
      computeTotals(lines, { kind: "percent", percent: "10" as never }, 0),
    ).toThrow("Discount thik nai");
  });

  it("rejects a negative paid amount", () => {
    expect(() => computeTotals(lines, percent(0), -1)).toThrow(
      "paidPaisa cannot be negative",
    );
  });

  it("rejects a fractional paid amount", () => {
    expect(() => computeTotals(lines, percent(0), 0.5)).toThrow(
      "paidPaisa must be a whole number",
    );
  });
});

describe("computeTotals — amount discount", () => {
  const lines = [
    { ratePaisa: 12000, quantity: 3 },
    { ratePaisa: 1400, quantity: 5 },
  ]; // subtotal 43000

  const amount = (a: number) => ({ kind: "amount" as const, amountPaisa: a });

  it("takes the exact paisa amount off, no rounding round-trip", () => {
    const { discountPaisa, totalPaisa } = computeTotals(lines, amount(3341), 0);
    expect(discountPaisa).toBe(3341);
    expect(totalPaisa).toBe(39659);
  });

  it("derives a display percent from the amount", () => {
    expect(computeTotals(lines, amount(4300), 0).discountPercent).toBe(10);
  });

  it("rounds the derived percent to 2 decimals", () => {
    // 1000 / 43000 * 100 = 2.325581...
    expect(computeTotals(lines, amount(1000), 0).discountPercent).toBe(2.33);
  });

  it("rejects an amount above the subtotal", () => {
    expect(() => computeTotals(lines, amount(43001), 0)).toThrow(
      "Discount subtotal er beshi hote parbe na",
    );
  });

  it("allows an amount equal to the subtotal, wiping out the total", () => {
    expect(computeTotals(lines, amount(43000), 0).totalPaisa).toBe(0);
  });

  it("allows a zero amount", () => {
    const { discountPaisa, discountPercent } = computeTotals(lines, amount(0), 0);
    expect(discountPaisa).toBe(0);
    expect(discountPercent).toBe(0);
  });

  it("rejects a negative amount", () => {
    expect(() => computeTotals(lines, amount(-1), 0)).toThrow(
      "Discount 0 er kom hote parbe na",
    );
  });

  it("rejects a fractional amount", () => {
    expect(() => computeTotals(lines, amount(100.5), 0)).toThrow("Discount thik nai");
  });

  it("handles a zero subtotal without dividing by zero", () => {
    const { discountPercent, totalPaisa } = computeTotals([], amount(0), 0);
    expect(discountPercent).toBe(0);
    expect(totalPaisa).toBe(0);
  });
});
```

- [ ] **Step 3: Run and confirm green**

Run: `npx vitest run tests/lib/saleTotals.test.ts`
Expected: all tests pass (0 failed).

- [ ] **Step 4: Commit**

```bash
git add src/lib/saleTotals.ts tests/lib/saleTotals.test.ts
git commit -m "$(cat <<'EOF'
feat: computeTotals accepts a percent-or-amount discount

Adds the amount-discount branch the retail counter's dual-box discount
UI needs, while keeping percent-mode math byte-identical to today.
Also fixes two stale tests that expected an overpayment rejection the
function's own doc comment says it deliberately does not do.
EOF
)"
```

---

### Task 2: Extract `buildSaleLines`, refactor `writeWholesaleSale` onto it and the new `computeTotals`

**Files:**
- Create: `src/lib/saleLines.ts`
- Test: `tests/lib/saleLines.test.ts`
- Modify: `src/lib/writeWholesaleSale.ts`
- Modify: `src/components/WholesaleSaleForm.tsx:141-152` (the local totals preview)

**Interfaces:**
- Consumes: nothing new from earlier tasks except `DiscountInput` (Task 1).
- Produces: `SaleItemInput = { medicineId?: string; customName?: string; customPricePaisa?: number; boxes: number; patas?: number }`, `SaleLineDraft` (the priced/stock-deducted line shape), and `buildSaleLines(items: SaleItemInput[], session: ClientSession, priceMode: "retail" | "wholesale"): Promise<SaleLineDraft[]>`. Task 5 (`writeRetailSale`) depends on both.

- [ ] **Step 1: Write `src/lib/saleLines.ts`**

```ts
import mongoose, { type ClientSession } from "mongoose";
import { boxesToPatas } from "@/lib/units";
import { applyStockDelta } from "@/lib/stockTransaction";
import { MedicineModel } from "@/models/Medicine";

export type SaleItemInput = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  boxes: number;
  patas?: number;
};

export type SaleLineDraft = {
  medicineId: mongoose.Types.ObjectId | null;
  medicineName: string;
  form: string;
  unit: "box";
  quantity: number;
  leftoverPatas: number;
  ratePaisa: number;
  lineTotalPaisa: number;
  patasDeducted: number;
};

/**
 * Turns requested items into priced, stock-deducted sale lines — the box +
 * leftoverPatas convention every sale line uses (see the saleLineSchema
 * comment in src/models/Sale.ts). `priceMode` picks which of a medicine's
 * two independent rate pairs to bill: wholesaleBoxPricePaisa /
 * wholesalePataPricePaisa, or retailBoxPricePaisa / retailPataPricePaisa.
 *
 * Both writeWholesaleSale and writeRetailSale call this, so a medicine line
 * cannot price or deduct stock two different ways depending on which sale
 * type it's on.
 *
 * MUST be called from inside an already-open transaction (`session`). A
 * sale always succeeds once every line's medicine is found — there is no
 * "not enough stock" refusal, so stock may go negative.
 */
export async function buildSaleLines(
  items: SaleItemInput[],
  session: ClientSession,
  priceMode: "retail" | "wholesale",
): Promise<SaleLineDraft[]> {
  const lines: SaleLineDraft[] = [];

  for (const item of items) {
    if (item.medicineId) {
      const medicine = await MedicineModel.findById(item.medicineId).session(
        session,
      );
      if (!medicine) throw new Error("Medicine pawa jay ni");

      const boxPricePaisa =
        priceMode === "wholesale"
          ? medicine.wholesaleBoxPricePaisa
          : medicine.retailBoxPricePaisa;
      const pataPricePaisa =
        priceMode === "wholesale"
          ? medicine.wholesalePataPricePaisa
          : medicine.retailPataPricePaisa;

      const leftoverPatas = item.patas ?? 0;
      const totalPatas =
        boxesToPatas(item.boxes, medicine.patasPerBox) + leftoverPatas;

      // A zero line takes nothing off the shelf. Skipped rather than passed
      // through applyStockDelta as a delta of 0, which would issue an
      // `$inc: 0` that changes nothing; its other half — "does this medicine
      // still exist" — is already covered by the findById above.
      if (totalPatas > 0) {
        const ok = await applyStockDelta(medicine._id, -totalPatas, session);
        if (!ok) throw new Error("Medicine pawa jay ni");
      }

      lines.push({
        medicineId: medicine._id,
        medicineName: medicine.name,
        form: medicine.form,
        unit: "box",
        quantity: item.boxes,
        leftoverPatas,
        ratePaisa: boxPricePaisa,
        lineTotalPaisa:
          item.boxes * boxPricePaisa + leftoverPatas * pataPricePaisa,
        patasDeducted: totalPatas,
      });
    } else {
      if (!item.customName || item.customPricePaisa === undefined) {
        throw new Error("Custom item er nam o price dite hobe");
      }
      lines.push({
        medicineId: null,
        medicineName: item.customName,
        form: "custom",
        unit: "box",
        quantity: item.boxes,
        leftoverPatas: 0,
        ratePaisa: item.customPricePaisa,
        lineTotalPaisa: item.boxes * item.customPricePaisa,
        patasDeducted: 0,
      });
    }
  }

  return lines;
}
```

- [ ] **Step 2: Write `tests/lib/saleLines.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { MedicineModel } from "@/models/Medicine";

setupTestDb();

async function makeMedicine(overrides: Record<string, unknown> = {}, stockPatas = 500) {
  const name = (overrides.name as string | undefined) ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    purchasePricePaisa: 9000,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    retailBoxPricePaisa: 13000,
    retailPataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

async function run(items: SaleItemInput[], priceMode: "retail" | "wholesale") {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await buildSaleLines(items, session, priceMode);
    });
  } finally {
    await session.endSession();
  }
  return result!;
}

describe("buildSaleLines", () => {
  it("prices a wholesale line from the wholesale rates and deducts stock", async () => {
    const medicine = await makeMedicine();
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
      "wholesale",
    );
    expect(lines[0].ratePaisa).toBe(12000);
    expect(lines[0].lineTotalPaisa).toBe(2 * 12000 + 3 * 1300);
    expect(lines[0].patasDeducted).toBe(23);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(477);
  });

  it("prices a retail line from the retail rates, independently of wholesale", async () => {
    const medicine = await makeMedicine();
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
      "retail",
    );
    expect(lines[0].ratePaisa).toBe(13000);
    expect(lines[0].lineTotalPaisa).toBe(2 * 13000 + 3 * 1400);
    expect(lines[0].patasDeducted).toBe(23);
  });

  it("keeps a zero-quantity line on the sale and takes no stock", async () => {
    const medicine = await makeMedicine({}, 50);
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 0, patas: 0 }],
      "retail",
    );
    expect(lines[0].quantity).toBe(0);
    expect(lines[0].lineTotalPaisa).toBe(0);
    expect(lines[0].patasDeducted).toBe(0);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(50);
  });

  it("defaults patas to 0 when a caller omits it", async () => {
    const medicine = await makeMedicine();
    const lines = await run([{ medicineId: String(medicine._id), boxes: 2 }], "wholesale");
    expect(lines[0].leftoverPatas).toBe(0);
    expect(lines[0].lineTotalPaisa).toBe(24000);
  });

  it("prices a custom item at its own flat price, no stock touched", async () => {
    const lines = await run(
      [{ customName: "Syringe", customPricePaisa: 2000, boxes: 3 }],
      "retail",
    );
    expect(lines[0].medicineId).toBeNull();
    expect(lines[0].medicineName).toBe("Syringe");
    expect(lines[0].lineTotalPaisa).toBe(6000);
    expect(lines[0].patasDeducted).toBe(0);
  });

  it("rejects a custom item with no price", async () => {
    await expect(
      run([{ customName: "Syringe", boxes: 1 }], "retail"),
    ).rejects.toThrow("Custom item er nam o price dite hobe");
  });

  it("rejects an unknown medicine id", async () => {
    await expect(
      run([{ medicineId: "507f1f77bcf86cd799439011", boxes: 1 }], "retail"),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("lets stock go negative rather than refusing the sale", async () => {
    const medicine = await makeMedicine({}, 5);
    const lines = await run(
      [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      "retail",
    );
    expect(lines[0].patasDeducted).toBe(10);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  });
});
```

- [ ] **Step 3: Run and confirm green**

Run: `npx vitest run tests/lib/saleLines.test.ts`
Expected: all pass.

- [ ] **Step 4: Refactor `src/lib/writeWholesaleSale.ts` to use `buildSaleLines` and the new `computeTotals`**

Replace the file's item-building loop and its `computeTotals` call. Full replacement:

```ts
import mongoose, { type ClientSession } from "mongoose";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { computeTotals } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type WriteWholesaleSaleParams = {
  session: ClientSession;
  buyer: {
    id: mongoose.Types.ObjectId;
    name: string;
    shopName: string;
    phone: string;
  };
  items: SaleItemInput[];
  /** A percentage of the subtotal, 0-100. May be fractional. */
  discountPercent: number;
  paidPaisa: number;
  createdBy: string;
  orderId?: string | null;
};

/**
 * The single definition of "make a wholesale sale". Both the wholesale form
 * (recordWholesaleSale) and order approval (approveOrder) call this, so the
 * two paths cannot drift into different stock, invoice, or totalling rules.
 *
 * MUST be called from inside an already-open transaction (`session`). Every
 * read and write here uses that session, and stock goes through
 * buildSaleLines -> applyStockDelta. A sale always succeeds once every
 * line's medicine is found — there is no "not enough stock" refusal, so
 * stock may go negative. Reads are inside the caller's withTransaction so a
 * retry re-evaluates them.
 */
export async function writeWholesaleSale(
  params: WriteWholesaleSaleParams,
): Promise<SaleDoc> {
  const { session } = params;

  // A line may be zero — that is how the owner says "you ordered this, it was
  // out of stock" and still has it print on the invoice. A sale where *every*
  // line is zero bills nothing for nothing, so it is not a sale. This rule
  // lives here rather than in either caller's validator so the wholesale form
  // and order approval cannot drift into two different ideas of what a sale
  // is; the per-field shape checks stay at each action's trust boundary.
  if (!params.items.some((item) => item.boxes > 0 || (item.patas ?? 0) > 0)) {
    throw new Error("Onto ekta line e poriman dite hobe");
  }

  const lines = await buildSaleLines(params.items, session, "wholesale");

  // computeTotals normally re-derives the subtotal itself, via
  // ratePaisa * quantity per line — an assumption that breaks for a mixed
  // box+pata line, where lineTotalPaisa is not ratePaisa * quantity. Passing
  // quantity: 1 and ratePaisa: the line's own already-computed total sidesteps
  // that: lineTotal(ratePaisa, 1) is just ratePaisa, so the sum reproduces
  // exactly what was priced above, for every line, mixed or not.
  const { subtotalPaisa, discountPaisa, totalPaisa, duePaisa } = computeTotals(
    lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
    { kind: "percent", percent: params.discountPercent },
    params.paidPaisa,
  );

  const settings = await SettingsModel.findOne({ key: "singleton" }).session(
    session,
  );
  const prefix = settings?.invoicePrefix ?? "ABC";
  const seq = await nextInvoiceSeq(session);

  const [sale] = await SaleModel.create(
    [
      {
        type: "wholesale",
        buyerId: params.buyer.id,
        buyerName: params.buyer.name,
        buyerShopName: params.buyer.shopName,
        buyerPhone: params.buyer.phone,
        invoiceNo: formatInvoiceNo(prefix, seq),
        orderId: params.orderId ?? null,
        items: lines,
        subtotalPaisa,
        discountPercent: params.discountPercent,
        discountPaisa,
        totalPaisa,
        paidPaisa: params.paidPaisa,
        duePaisa,
        status: "active",
        createdBy: new mongoose.Types.ObjectId(params.createdBy),
      },
    ],
    { session },
  );
  return sale;
}
```

- [ ] **Step 5: Update `WholesaleSaleForm.tsx`'s local totals preview**

In `src/components/WholesaleSaleForm.tsx`, find the `computeTotals(...)` call inside the totals-preview `try` block (around line 142) and change only the second argument:

```ts
    const totals = computeTotals(
      cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
      { kind: "percent", percent: discountPercent },
      paidPaisa,
    );
```

No other line in this file changes in this task.

- [ ] **Step 6: Run and confirm no new breakage**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts`
Expected: `tests/lib/writeWholesaleSale.test.ts` fully green (proof the extraction didn't move wholesale's numbers). `tests/actions/sales.test.ts` still shows the same 4 pre-existing failures listed in Global Constraints (`rejects paying more than the total`, `still rejects a negative quantity`, `rejects a negative patas quantity`, `rejects a fractional patas quantity`) — unchanged by this task, fixed in Task 6. No *new* failures beyond those 4 plus the retail tests that Task 6 will rewrite anyway.

- [ ] **Step 7: Commit**

```bash
git add src/lib/saleLines.ts tests/lib/saleLines.test.ts src/lib/writeWholesaleSale.ts src/components/WholesaleSaleForm.tsx
git commit -m "$(cat <<'EOF'
refactor: extract buildSaleLines from writeWholesaleSale

Pulls the item-pricing/stock-deduction loop into a shared, price-mode
-parameterized helper so a retail write path can reuse it exactly,
instead of a second hand-written copy that could drift. Wholesale's
own numbers are unchanged — writeWholesaleSale.test.ts is the proof.
EOF
)"
```

---

### Task 3: `RetailCustomer` / `RetailPayment` models + `retailDueComputation.ts`

**Files:**
- Create: `src/models/RetailCustomer.ts`
- Create: `src/models/RetailPayment.ts`
- Create: `src/lib/retailDueComputation.ts`
- Test: `tests/lib/retailDueComputation.test.ts`

**Interfaces:**
- Produces: `RetailCustomerModel`, `RetailPaymentModel`, `RetailPaymentDoc`, `computeRetailDue(phone: string, session?: mongoose.ClientSession): Promise<number>`, `loadRetailLedger(phone: string): Promise<{ sales: SaleDoc[]; payments: RetailPaymentDoc[] }>`. Tasks 4, 5, 6 all depend on the models; Task 4 depends on the two functions.

No dedicated model test files — `Buyer`/`Payment` don't have them either in this codebase; their behavior is proven through the lib/action tests that use them (Task 3's own test file, plus Tasks 4-6).

- [ ] **Step 1: Write `src/models/RetailCustomer.ts`**

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const retailCustomerSchema = new Schema(
  {
    // Natural unique key: one document per phone number, so the retail
    // counter's autocomplete and recordRetailPayment's write-conflict guard
    // (see recordRetailPayment in src/actions/due.ts) both have exactly one
    // document to read and bump — the same role Buyer plays for wholesale.
    phone: { type: String, required: true, unique: true, trim: true },
    // The name last used at the counter for this phone. "One phone, one
    // remembered name" — same rule the retail-customer lookup this replaces
    // already established, just persisted instead of re-derived from Sale
    // history on every call.
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export type RetailCustomerDoc = InferSchemaType<typeof retailCustomerSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RetailCustomerModel: Model<RetailCustomerDoc> =
  (mongoose.models.RetailCustomer as Model<RetailCustomerDoc>) ??
  mongoose.model<RetailCustomerDoc>("RetailCustomer", retailCustomerSchema);
```

- [ ] **Step 2: Write `src/models/RetailPayment.ts`**

```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const retailPaymentSchema = new Schema(
  {
    // Phone rather than a buyerId FK — a retail customer has no managed
    // account to reference (see RetailCustomer).
    phone: { type: String, required: true, trim: true },
    amountPaisa: { type: Number, required: true, min: 1 },
    note: { type: String, default: "", trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

retailPaymentSchema.index({ phone: 1, createdAt: -1 });

export type RetailPaymentDoc = InferSchemaType<typeof retailPaymentSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const RetailPaymentModel: Model<RetailPaymentDoc> =
  (mongoose.models.RetailPayment as Model<RetailPaymentDoc>) ??
  mongoose.model<RetailPaymentDoc>("RetailPayment", retailPaymentSchema);
```

- [ ] **Step 3: Write `src/lib/retailDueComputation.ts`**

```ts
import mongoose from "mongoose";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { RetailPaymentModel, type RetailPaymentDoc } from "@/models/RetailPayment";

/**
 * A retail customer's signed outstanding balance in paisa, keyed by phone
 * number the same way computeBuyerDue (src/lib/dueComputation.ts) is keyed
 * by buyerId — positive = the customer owes, negative = the pharmacy owes
 * credit. Derived from active retail sales and retail payments, never
 * stored. See computeBuyerDue's doc comment for the full credit-on-
 * cancellation rationale; the rule here is identical, just phone-keyed.
 *
 * `session` is optional for the same reason it is on computeBuyerDue: so
 * recordRetailPayment (src/actions/due.ts) can run this exact read inside
 * its own Mongo transaction.
 */
export async function computeRetailDue(
  phone: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const trimmed = phone.trim();
  if (!trimmed) return 0;

  const [saleAgg] = await SaleModel.aggregate<{ total: number }>([
    { $match: { buyerPhone: trimmed, type: "retail", status: "active" } },
    { $group: { _id: null, total: { $sum: "$duePaisa" } } },
  ]).session(session ?? null);
  const [payAgg] = await RetailPaymentModel.aggregate<{ total: number }>([
    { $match: { phone: trimmed } },
    { $group: { _id: null, total: { $sum: "$amountPaisa" } } },
  ]).session(session ?? null);

  return (saleAgg?.total ?? 0) - (payAgg?.total ?? 0);
}

/** A retail customer's sales and payments for one phone, newest first. */
export async function loadRetailLedger(
  phone: string,
): Promise<{ sales: SaleDoc[]; payments: RetailPaymentDoc[] }> {
  const trimmed = phone.trim();
  if (!trimmed) return { sales: [], payments: [] };

  const [sales, payments] = await Promise.all([
    SaleModel.find({ buyerPhone: trimmed, type: "retail" })
      .sort({ createdAt: -1 })
      .lean<SaleDoc[]>(),
    RetailPaymentModel.find({ phone: trimmed })
      .sort({ createdAt: -1 })
      .lean<RetailPaymentDoc[]>(),
  ]);
  return { sales, payments };
}
```

- [ ] **Step 4: Write `tests/lib/retailDueComputation.test.ts`**

Retail sales are constructed directly via `SaleModel.create` here (not through an action) because the retail write path doesn't exist yet until Task 5.

```ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { SaleModel } from "@/models/Sale";
import { RetailPaymentModel } from "@/models/RetailPayment";
import { computeRetailDue, loadRetailLedger } from "@/lib/retailDueComputation";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId();

function retailSale(overrides: Record<string, unknown> = {}) {
  return {
    type: "retail",
    buyerId: null,
    buyerName: "Karim",
    buyerPhone: "01711111111",
    invoiceNo: `ABC-${Math.floor(Math.random() * 1000000)}`,
    items: [
      {
        medicineId: new mongoose.Types.ObjectId(),
        medicineName: "Napa 500mg",
        unit: "box",
        quantity: 1,
        ratePaisa: 13000,
        lineTotalPaisa: 13000,
        patasDeducted: 10,
        leftoverPatas: 0,
      },
    ],
    subtotalPaisa: 13000,
    discountPercent: 0,
    discountPaisa: 0,
    totalPaisa: 13000,
    paidPaisa: 0,
    duePaisa: 13000,
    status: "active",
    createdBy: CREATED_BY,
    ...overrides,
  };
}

function retailPayment(overrides: Record<string, unknown> = {}) {
  return {
    phone: "01711111111",
    amountPaisa: 5000,
    note: "",
    createdBy: CREATED_BY,
    ...overrides,
  };
}

describe("computeRetailDue", () => {
  it("shows a positive balance for an unpaid retail sale", async () => {
    await SaleModel.create(retailSale());
    expect(await computeRetailDue("01711111111")).toBe(13000);
  });

  it("subtracts retail payments from the total due", async () => {
    await SaleModel.create(retailSale());
    await RetailPaymentModel.create(retailPayment());
    expect(await computeRetailDue("01711111111")).toBe(8000);
  });

  it("excludes cancelled sales", async () => {
    await SaleModel.create(retailSale({ status: "cancelled" }));
    expect(await computeRetailDue("01711111111")).toBe(0);
  });

  it("ignores wholesale sales on the same phone", async () => {
    await SaleModel.create(
      retailSale({ type: "wholesale", buyerId: new mongoose.Types.ObjectId() }),
    );
    expect(await computeRetailDue("01711111111")).toBe(0);
  });

  it("returns 0 for a phone never seen", async () => {
    expect(await computeRetailDue("01999999999")).toBe(0);
  });

  it("returns 0 for a blank phone without matching the sales that have none", async () => {
    await SaleModel.create(retailSale({ buyerPhone: "" }));
    expect(await computeRetailDue("")).toBe(0);
    expect(await computeRetailDue("   ")).toBe(0);
  });

  it("goes negative (credit) when payments exceed the due", async () => {
    await SaleModel.create(retailSale({ totalPaisa: 5000, duePaisa: 5000 }));
    await RetailPaymentModel.create(retailPayment({ amountPaisa: 8000 }));
    expect(await computeRetailDue("01711111111")).toBe(-3000);
  });
});

describe("loadRetailLedger", () => {
  it("returns only the named phone's sales and payments", async () => {
    await SaleModel.create(retailSale());
    await SaleModel.create(retailSale({ buyerPhone: "01722222222" }));
    await RetailPaymentModel.create(retailPayment());

    const ledger = await loadRetailLedger("01711111111");
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.payments).toHaveLength(1);
  });

  it("returns empty arrays for a blank phone", async () => {
    const ledger = await loadRetailLedger("");
    expect(ledger.sales).toEqual([]);
    expect(ledger.payments).toEqual([]);
  });
});
```

- [ ] **Step 5: Run and confirm green**

Run: `npx vitest run tests/lib/retailDueComputation.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/models/RetailCustomer.ts src/models/RetailPayment.ts src/lib/retailDueComputation.ts tests/lib/retailDueComputation.test.ts
git commit -m "$(cat <<'EOF'
feat: RetailCustomer/RetailPayment models and phone-keyed due math

Mirrors Buyer/Payment/dueComputation.ts, keyed by phone instead of a
buyerId FK, since a retail customer has no managed account.
EOF
)"
```

---

### Task 4: `due.ts` — retail due ledger actions

**Files:**
- Modify: `src/actions/due.ts`
- Test: `tests/actions/due.test.ts` (append)

**Interfaces:**
- Consumes: `computeRetailDue`, `loadRetailLedger` (Task 3), `RetailCustomerModel`, `RetailPaymentModel` (Task 3).
- Produces: `RetailDueRow = { phone: string; customerName: string; duePaisa: number }`, `RetailLedgerResult = { sales: Serialized<SaleDoc>[]; payments: Serialized<RetailPaymentDoc>[] }`, `listRetailDues(): Promise<RetailDueRow[]>`, `retailDueBalance(phone: string): Promise<number>`, `retailLedger(phone: string): Promise<RetailLedgerResult>`, `recordRetailPayment(phone: string, amountTaka: number, note: string): Promise<ActionResult<void>>`. Task 9 (RetailDueTable/RetailLedger) depends on the row/result shapes.

- [ ] **Step 1: Add imports to the top of `src/actions/due.ts`**

Add alongside the existing imports:

```ts
import { computeRetailDue, loadRetailLedger } from "@/lib/retailDueComputation";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import { RetailPaymentModel, type RetailPaymentDoc } from "@/models/RetailPayment";
```

- [ ] **Step 2: Append the retail due functions to `src/actions/due.ts`**

Add at the end of the file, after `recordPayment`:

```ts
export type RetailDueRow = {
  phone: string;
  customerName: string;
  duePaisa: number;
};

/**
 * Same shape as listBuyerDues but grouped by phone instead of buyerId, and
 * only over retail sales. Only phones that have ever had an active retail
 * sale appear — same "at least one sale on credit" gate listBuyerDues uses.
 */
export async function listRetailDues(): Promise<RetailDueRow[]> {
  await requireAdminAction();
  await connectDb();

  const saleTotals = await SaleModel.aggregate<{
    _id: string;
    totalDuePaisa: number;
  }>([
    { $match: { type: "retail", status: "active", buyerPhone: { $gt: "" } } },
    { $group: { _id: "$buyerPhone", totalDuePaisa: { $sum: "$duePaisa" } } },
  ]);

  const paymentTotals = await RetailPaymentModel.aggregate<{
    _id: string;
    totalPaid: number;
  }>([{ $group: { _id: "$phone", totalPaid: { $sum: "$amountPaisa" } } }]);

  const paymentByPhone = new Map<string, number>();
  for (const p of paymentTotals) {
    paymentByPhone.set(p._id, p.totalPaid);
  }

  const phones = saleTotals.map((s) => s._id);
  const customers = await RetailCustomerModel.find({ phone: { $in: phones } })
    .select("phone name")
    .lean<{ phone: string; name: string }[]>();
  const nameByPhone = new Map(customers.map((c) => [c.phone, c.name]));

  const rows: RetailDueRow[] = saleTotals.map((s) => ({
    phone: s._id,
    customerName: nameByPhone.get(s._id) ?? "",
    duePaisa: s.totalDuePaisa - (paymentByPhone.get(s._id) ?? 0),
  }));

  return rows.sort((a, b) => b.duePaisa - a.duePaisa);
}

export async function retailDueBalance(phone: string): Promise<number> {
  await requireAdminAction();
  await connectDb();
  if (typeof phone !== "string") return 0;
  return computeRetailDue(phone);
}

export type RetailLedgerResult = {
  sales: Serialized<SaleDoc>[];
  payments: Serialized<RetailPaymentDoc>[];
};

export async function retailLedger(phone: string): Promise<RetailLedgerResult> {
  await requireAdminAction();
  await connectDb();
  if (typeof phone !== "string") return { sales: [], payments: [] };

  const { sales, payments } = await loadRetailLedger(phone);
  return { sales: toPlainList(sales), payments: toPlainList(payments) };
}

/**
 * Records a payment against a retail customer's phone-keyed due, mirroring
 * recordPayment. Bumps RetailCustomer.__v as the write-conflict anchor —
 * see recordPayment's comment for why a plain read-then-insert would race
 * under a double-click; the mechanism here is identical, just phone-keyed.
 * The customer must already exist (no upsert): a payment against a phone
 * nobody has ever sold to has nothing to pay against.
 */
export async function recordRetailPayment(
  phone: string,
  amountTaka: number,
  note: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (typeof phone !== "string" || !phone.trim()) {
      throw new Error("Phone number thik nai");
    }
    const trimmedPhone = phone.trim();

    const amountPaisa = Math.round(takaToPaisa(amountTaka));
    if (!Number.isInteger(amountPaisa) || amountPaisa < 1) {
      throw new Error("Taka 1 er kom hote parbe na");
    }
    if (typeof note !== "string") throw new Error("note must be a string");

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const customer = await RetailCustomerModel.findOneAndUpdate(
          { phone: trimmedPhone },
          { $inc: { __v: 1 } },
          { session, new: true },
        );
        if (!customer) {
          throw new Error("Ei phone number-e kono customer pawa jay ni");
        }

        const due = await computeRetailDue(trimmedPhone, session);

        if (due <= 0) {
          throw new Error(
            due < 0
              ? `Ei customer-er kono baki nei — uni borong ${new Intl.NumberFormat("en-BD").format(-due / 100)} ৳ joma ache, notun kore joma neoya lagbe na`
              : "Ei customer-er kono baki nei, joma neoya lagbe na",
          );
        }
        if (amountPaisa > due) {
          throw new Error(
            `Joma ${new Intl.NumberFormat("en-BD").format(amountPaisa / 100)} ৳ baki ${new Intl.NumberFormat("en-BD").format(due / 100)} ৳ er cheye beshi hote parbe na`,
          );
        }

        await RetailPaymentModel.create(
          [
            {
              phone: trimmedPhone,
              amountPaisa,
              note: note.trim(),
              createdBy: new mongoose.Types.ObjectId(adminSession.userId),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  });
}
```

- [ ] **Step 3: Append tests to `tests/actions/due.test.ts`**

Add a `makeRetailCustomer` helper near the top (after `makeBuyer`) and new `describe` blocks at the end. Because `writeRetailSale` doesn't exist until Task 5, retail sale fixtures are inserted directly.

```ts
// Add to the imports at the top:
import mongoose from "mongoose";
import { SaleModel } from "@/models/Sale";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import {
  listBuyerDues,
  buyerDueBalance,
  buyerLedger,
  recordPayment,
  listRetailDues,
  retailDueBalance,
  retailLedger,
  recordRetailPayment,
} from "@/actions/due";

// Add near makeBuyer:
async function makeRetailCustomer(phone: string, name = "Karim") {
  return RetailCustomerModel.create({ phone, name });
}

const CREATED_BY = new mongoose.Types.ObjectId();
function retailSale(overrides: Record<string, unknown> = {}) {
  return {
    type: "retail",
    buyerId: null,
    buyerName: "Karim",
    buyerPhone: "01711111111",
    invoiceNo: `ABC-${Math.floor(Math.random() * 1000000)}`,
    items: [
      {
        medicineId: new mongoose.Types.ObjectId(),
        medicineName: "Napa 500mg",
        unit: "box",
        quantity: 1,
        ratePaisa: 13000,
        lineTotalPaisa: 13000,
        patasDeducted: 10,
        leftoverPatas: 0,
      },
    ],
    subtotalPaisa: 13000,
    discountPercent: 0,
    discountPaisa: 0,
    totalPaisa: 13000,
    paidPaisa: 0,
    duePaisa: 13000,
    status: "active",
    createdBy: CREATED_BY,
    ...overrides,
  };
}

// Append at the end of the file:
describe("listRetailDues", () => {
  it("sums due across a phone's sales and subtracts payments", async () => {
    await makeRetailCustomer("01711111111", "Karim");
    await SaleModel.create(retailSale({ duePaisa: 13000 }));
    await SaleModel.create(retailSale({ duePaisa: 2000, totalPaisa: 2000 }));
    await RetailPaymentModel.create({
      phone: "01711111111",
      amountPaisa: 5000,
      note: "",
      createdBy: CREATED_BY,
    });

    const dues = await listRetailDues();
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ phone: "01711111111", customerName: "Karim", duePaisa: 10000 });
  });

  it("excludes cancelled sales", async () => {
    await SaleModel.create(retailSale({ status: "cancelled" }));
    expect(await listRetailDues()).toHaveLength(0);
  });

  it("orders by due amount descending", async () => {
    await makeRetailCustomer("01711111111", "Karim");
    await makeRetailCustomer("01722222222", "Rahim");
    await SaleModel.create(retailSale({ buyerPhone: "01711111111", duePaisa: 2000, totalPaisa: 2000 }));
    await SaleModel.create(retailSale({ buyerPhone: "01722222222", duePaisa: 12000 }));

    const dues = await listRetailDues();
    expect(dues[0].phone).toBe("01722222222");
    expect(dues[1].phone).toBe("01711111111");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(listRetailDues()).rejects.toThrow();
  });
});

describe("retailDueBalance", () => {
  it("returns the signed due for a phone", async () => {
    await SaleModel.create(retailSale({ duePaisa: 13000 }));
    expect(await retailDueBalance("01711111111")).toBe(13000);
  });

  it("returns 0 for a phone never seen", async () => {
    expect(await retailDueBalance("01999999999")).toBe(0);
  });
});

describe("retailLedger", () => {
  it("returns sales and payments for one phone", async () => {
    await SaleModel.create(retailSale());
    await RetailPaymentModel.create({
      phone: "01711111111",
      amountPaisa: 1000,
      note: "",
      createdBy: CREATED_BY,
    });

    const ledger = await retailLedger("01711111111");
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.payments).toHaveLength(1);
  });
});

describe("recordRetailPayment", () => {
  it("records a valid payment and reduces the due", async () => {
    await makeRetailCustomer("01711111111");
    await SaleModel.create(retailSale({ duePaisa: 12000 }));

    await unwrap(recordRetailPayment("01711111111", 50, "Cash"));

    expect(await retailDueBalance("01711111111")).toBe(7000);
  });

  it("rejects a payment against a phone with no RetailCustomer", async () => {
    await SaleModel.create(retailSale({ duePaisa: 12000 }));
    await expect(
      unwrap(recordRetailPayment("01711111111", 50, "Cash")),
    ).rejects.toThrow("kono customer pawa jay ni");
  });

  it("rejects paying more than the due balance", async () => {
    await makeRetailCustomer("01711111111");
    await SaleModel.create(retailSale({ duePaisa: 2000, totalPaisa: 2000 }));
    await expect(
      unwrap(recordRetailPayment("01711111111", 25, "test")),
    ).rejects.toThrow("hote parbe na");
  });

  it("rejects any payment when the customer has no baki, with a clear message for credit", async () => {
    await makeRetailCustomer("01711111111");
    await SaleModel.create(retailSale({ duePaisa: 12000 }));
    await unwrap(recordRetailPayment("01711111111", 120, "Cash")); // pays exactly

    await expect(
      unwrap(recordRetailPayment("01711111111", 10, "test")),
    ).rejects.toThrow("kono baki nei");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(unwrap(recordRetailPayment("01711111111", 50, ""))).rejects.toThrow();
  });

  it("does not let two concurrent payments for the whole due both commit", async () => {
    await makeRetailCustomer("01711111111");
    await SaleModel.create(retailSale({ duePaisa: 12000 }));

    const results = await Promise.allSettled([
      unwrap(recordRetailPayment("01711111111", 120, "concurrent A")),
      unwrap(recordRetailPayment("01711111111", 120, "concurrent B")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await retailDueBalance("01711111111")).toBe(0);
  });
});
```

- [ ] **Step 4: Run and confirm green**

Run: `npx vitest run tests/actions/due.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/due.ts tests/actions/due.test.ts
git commit -m "$(cat <<'EOF'
feat: retail due ledger actions (listRetailDues, recordRetailPayment, ...)

Phone-keyed mirrors of the buyer due actions, added to the existing
due.ts module rather than a new one so authorization.test.ts's pinned
action-module list needs no update.
EOF
)"
```

---

### Task 5: `writeRetailSale`

**Files:**
- Create: `src/lib/writeRetailSale.ts`
- Test: `tests/lib/writeRetailSale.test.ts`

**Interfaces:**
- Consumes: `buildSaleLines`, `SaleItemInput` (Task 2), `computeTotals`, `DiscountInput` (Task 1), `RetailCustomerModel` (Task 3).
- Produces: `WriteRetailSaleParams`, `writeRetailSale(params: WriteRetailSaleParams): Promise<SaleDoc>`. Task 6 depends on this.

- [ ] **Step 1: Write `src/lib/writeRetailSale.ts`**

```ts
import mongoose, { type ClientSession } from "mongoose";
import { buildSaleLines, type SaleItemInput } from "@/lib/saleLines";
import { computeTotals, type DiscountInput } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { RetailCustomerModel } from "@/models/RetailCustomer";

export type WriteRetailSaleParams = {
  session: ClientSession;
  customerName: string;
  /** "" is allowed unless the sale ends up with a due — see the rule below. */
  customerPhone: string;
  items: SaleItemInput[];
  discount: DiscountInput;
  paidPaisa: number;
  createdBy: string;
};

/**
 * The single definition of "make a retail sale" — parallel to
 * writeWholesaleSale (src/lib/writeWholesaleSale.ts). Has one caller today
 * (recordRetailSale), but the transaction is non-trivial enough (line
 * building, discount math, invoice numbering, the phone-required-on-due
 * rule, the RetailCustomer upsert) to earn its own file and its own direct
 * tests, the same way writeWholesaleSale's does.
 *
 * MUST be called from inside an already-open transaction (`session`).
 */
export async function writeRetailSale(
  params: WriteRetailSaleParams,
): Promise<SaleDoc> {
  const { session } = params;

  if (!params.items.some((item) => item.boxes > 0 || (item.patas ?? 0) > 0)) {
    throw new Error("Onto ekta line e poriman dite hobe");
  }

  const lines = await buildSaleLines(params.items, session, "retail");

  const { subtotalPaisa, discountPercent, discountPaisa, totalPaisa, duePaisa } =
    computeTotals(
      lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
      params.discount,
      params.paidPaisa,
    );

  const trimmedPhone = params.customerPhone.trim();
  const trimmedName = params.customerName.trim();

  // A due with no way to find the customer again is not allowed to exist.
  if (duePaisa > 0 && !trimmedPhone) {
    throw new Error("Baki rakhte hole phone number dite hobe");
  }

  const settings = await SettingsModel.findOne({ key: "singleton" }).session(
    session,
  );
  const prefix = settings?.invoicePrefix ?? "ABC";
  const seq = await nextInvoiceSeq(session);

  if (trimmedPhone) {
    // "One phone, one remembered name" — the latest sale's name wins, same
    // rule the retail-counter autocomplete relies on.
    await RetailCustomerModel.findOneAndUpdate(
      { phone: trimmedPhone },
      { $set: { name: trimmedName } },
      { session, upsert: true },
    );
  }

  const [sale] = await SaleModel.create(
    [
      {
        type: "retail",
        buyerId: null,
        buyerName: trimmedName,
        buyerPhone: trimmedPhone,
        invoiceNo: formatInvoiceNo(prefix, seq),
        items: lines,
        subtotalPaisa,
        discountPercent,
        discountPaisa,
        totalPaisa,
        paidPaisa: params.paidPaisa,
        duePaisa,
        status: "active",
        createdBy: new mongoose.Types.ObjectId(params.createdBy),
      },
    ],
    { session },
  );
  return sale;
}
```

- [ ] **Step 2: Write `tests/lib/writeRetailSale.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { writeRetailSale, type WriteRetailSaleParams } from "@/lib/writeRetailSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";
import { RetailCustomerModel } from "@/models/RetailCustomer";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId().toString();

async function makeMedicine(overrides: Record<string, unknown> = {}, stockPatas = 500) {
  const name = (overrides.name as string | undefined) ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    purchasePricePaisa: 9000,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    retailBoxPricePaisa: 13000,
    retailPataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

async function run(params: Omit<WriteRetailSaleParams, "session" | "createdBy">) {
  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const sale = await writeRetailSale({ ...params, session, createdBy: CREATED_BY });
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }
  return SaleModel.findById(saleId);
}

describe("writeRetailSale", () => {
  it("charges the retail box rate and deducts stock", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Walk-in",
      customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 2, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 26000,
    });
    expect(sale!.type).toBe("retail");
    expect(sale!.totalPaisa).toBe(26000);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(480);
  });

  it("assigns a sequential invoice number from the shared counter", async () => {
    const medicine = await makeMedicine();
    const line = [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }];
    const first = await run({
      customerName: "Walk-in", customerPhone: "", items: line,
      discount: { kind: "percent", percent: 0 }, paidPaisa: 13000,
    });
    const second = await run({
      customerName: "Walk-in", customerPhone: "", items: line,
      discount: { kind: "percent", percent: 0 }, paidPaisa: 13000,
    });
    expect(first!.invoiceNo).toBe("ABC-000001");
    expect(second!.invoiceNo).toBe("ABC-000002");
  });

  it("applies an amount discount exactly, no rounding round-trip", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "amount", amountPaisa: 500 },
      paidPaisa: 12500,
    });
    expect(sale!.discountPaisa).toBe(500);
    expect(sale!.totalPaisa).toBe(12500);
    expect(sale!.duePaisa).toBe(0);
  });

  it("records a partial payment as a due when a phone is given", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      customerName: "Karim", customerPhone: "01711111111",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 5000,
    });
    expect(sale!.duePaisa).toBe(8000);
    expect(sale!.buyerPhone).toBe("01711111111");
  });

  it("rejects a due with no phone", async () => {
    const medicine = await makeMedicine();
    await expect(
      run({
        customerName: "Walk-in", customerPhone: "",
        items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
        discount: { kind: "percent", percent: 0 },
        paidPaisa: 5000,
      }),
    ).rejects.toThrow("Baki rakhte hole phone number dite hobe");
  });

  it("upserts a RetailCustomer when a phone is given", async () => {
    const medicine = await makeMedicine();
    await run({
      customerName: "Karim", customerPhone: "01711111111",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    const customer = await RetailCustomerModel.findOne({ phone: "01711111111" });
    expect(customer?.name).toBe("Karim");
  });

  it("does not create a RetailCustomer when no phone is given", async () => {
    const medicine = await makeMedicine();
    await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    expect(await RetailCustomerModel.countDocuments()).toBe(0);
  });

  it("prices a custom item and a zero-quantity line alongside a medicine line", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [
        { medicineId: String(supplied._id), boxes: 1, patas: 0 },
        { medicineId: String(outOfStock._id), boxes: 0, patas: 0 },
        { customName: "Syringe", customPricePaisa: 2000, boxes: 2 },
      ],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 17000,
    });
    expect(sale!.items).toHaveLength(3);
    expect(sale!.totalPaisa).toBe(13000 + 0 + 4000);
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    await expect(
      run({
        customerName: "Walk-in", customerPhone: "",
        items: [{ medicineId: String(medicine._id), boxes: 0, patas: 0 }],
        discount: { kind: "percent", percent: 0 },
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
    const medicine = await makeMedicine({}, 5);
    const sale = await run({
      customerName: "Walk-in", customerPhone: "",
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    });
    expect(sale!.totalPaisa).toBe(13000);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
  });
});
```

- [ ] **Step 3: Run and confirm green**

Run: `npx vitest run tests/lib/writeRetailSale.test.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/writeRetailSale.ts tests/lib/writeRetailSale.test.ts
git commit -m "$(cat <<'EOF'
feat: writeRetailSale — the single definition of "make a retail sale"

Parallel to writeWholesaleSale: builds lines via buildSaleLines, prices
via computeTotals's new percent-or-amount discount, assigns an invoice
number from the same shared counter as wholesale, upserts a
RetailCustomer when a phone is given, and refuses a due with no phone.
EOF
)"
```

---

### Task 6: `sales.ts` — `recordRetailSale` rewrite, shared item validation, `searchRetailCustomers`

**Files:**
- Modify: `src/actions/sales.ts`
- Test: `tests/actions/sales.test.ts` (rewrite the retail sections; fix the 4 pre-existing stale wholesale assertions)

**Interfaces:**
- Consumes: `writeRetailSale` (Task 5), `DiscountInput` (Task 1), `RetailCustomerModel` (Task 3).
- Produces: `RetailSaleInput` (new shape), `searchRetailCustomers(query: string): Promise<{ name: string; phone: string }[]>` (replaces `lookupRetailCustomer`, which is removed).

- [ ] **Step 1: Rewrite `src/actions/sales.ts` in full**

```ts
"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { applyStockDelta } from "@/lib/stockTransaction";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { writeRetailSale } from "@/lib/writeRetailSale";
import type { DiscountInput } from "@/lib/saleTotals";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { BuyerModel } from "@/models/Buyer";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import { actionResult, type ActionResult } from "@/lib/actionResult";

/**
 * Mirrors the convention in src/actions/medicines.ts: an optional string may
 * be absent or null and becomes "", but any other type is a malformed payload
 * on a network-reachable boundary and is rejected rather than stringified.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

/** Escapes regex metacharacters so a typed "." or "*" is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SaleItemShape = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  boxes: number;
  patas: number;
};

/**
 * Per-item shape checks shared by both sale types: a medicine line or a
 * custom line, non-negative integer boxes/patas, no medicine listed twice.
 * Whether an all-zero line is allowed on its own is a cart-level rule (see
 * writeWholesaleSale and writeRetailSale's "at least one billable line"
 * guard), not a per-item one, so it is not checked here.
 */
function validateSaleItems(items: unknown): asserts items is SaleItemShape[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart khali");
  }

  const seen = new Set<string>();
  for (const item of items as SaleItemShape[]) {
    if (item.medicineId) {
      if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
        throw new Error("Medicine pawa jay ni");
      }
      if (seen.has(item.medicineId)) {
        throw new Error("Ekoi medicine dui bar add kora jabe na");
      }
      seen.add(item.medicineId);
    } else {
      if (typeof item.customName !== "string" || !item.customName.trim()) {
        throw new Error("Custom item er nam dite hobe");
      }
      if (typeof item.customPricePaisa !== "number" || item.customPricePaisa < 0) {
        throw new Error("Custom item er price thik nai");
      }
    }

    if (typeof item.boxes !== "number" || !Number.isInteger(item.boxes) || item.boxes < 0) {
      throw new Error("Box er poriman thik nai");
    }
    if (typeof item.patas !== "number" || !Number.isInteger(item.patas) || item.patas < 0) {
      throw new Error("Pata er poriman thik nai");
    }
  }
}

function validateDiscountShape(discount: unknown): asserts discount is DiscountInput {
  if (
    !discount ||
    typeof discount !== "object" ||
    ((discount as DiscountInput).kind !== "percent" &&
      (discount as DiscountInput).kind !== "amount")
  ) {
    throw new Error("Discount thik nai");
  }
}

function validatePaidPaisa(paidPaisa: unknown): asserts paidPaisa is number {
  if (
    typeof paidPaisa !== "number" ||
    !Number.isInteger(paidPaisa) ||
    paidPaisa < 0
  ) {
    throw new Error("paidPaisa must be a whole number");
  }
}

export type RetailSaleInput = {
  items: {
    medicineId?: string;
    customName?: string;
    customPricePaisa?: number;
    boxes: number;
    patas: number;
  }[];
  /** Required. A counter sale must say who it was to. */
  customerName: string;
  /** Optional — required only when the sale ends up with a due. */
  customerPhone?: string;
  discount: DiscountInput;
  paidPaisa: number;
};

export async function recordRetailSale(
  input: RetailSaleInput,
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (typeof input.customerName !== "string" || !input.customerName.trim()) {
      throw new Error("Customer nam likhte hobe");
    }
    const customerPhone = toOptionalString(input.customerPhone, "customerPhone");
    validateSaleItems(input.items);
    validateDiscountShape(input.discount);
    validatePaidPaisa(input.paidPaisa);

    const session = await mongoose.startSession();
    let saleId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        const sale = await writeRetailSale({
          session,
          customerName: input.customerName.trim(),
          customerPhone,
          items: input.items,
          discount: input.discount,
          paidPaisa: input.paidPaisa,
          createdBy: adminSession.userId,
        });
        saleId = sale._id;
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
    revalidatePath("/sell");
    revalidatePath("/retail-due");

    const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
    return toPlain(sale!);
  });
}

export type WholesaleSaleInput = {
  buyerId: string;
  items: {
    medicineId?: string;
    customName?: string;
    customPricePaisa?: number;
    boxes: number;
    patas: number;
  }[];
  /** A percentage of the subtotal, 0-100. May be fractional. */
  discountPercent: number;
  paidPaisa: number;
};

/**
 * See validateSaleItems for the per-item shape checks shared with retail.
 */
function validateWholesale(input: WholesaleSaleInput): void {
  if (!mongoose.Types.ObjectId.isValid(input.buyerId)) {
    throw new Error("Buyer thik nai");
  }
  validateSaleItems(input.items);

  // computeTotals re-checks this against the actual subtotal; this catches
  // the malformed case before any database work happens. Fractional is
  // legal here — 2.5% is a real discount — so unlike the money fields there
  // is no integer check.
  if (
    typeof input.discountPercent !== "number" ||
    !Number.isFinite(input.discountPercent) ||
    input.discountPercent < 0 ||
    input.discountPercent > 100
  ) {
    throw new Error("Discount 0 theke 100 er moddhe hote hobe");
  }
  validatePaidPaisa(input.paidPaisa);
}

export async function recordWholesaleSale(
  input: WholesaleSaleInput,
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();
    validateWholesale(input);

    const session = await mongoose.startSession();
    let saleId: mongoose.Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        const buyer = await BuyerModel.findById(input.buyerId).session(session);
        if (!buyer) throw new Error("Buyer pawa jay ni");
        if (!buyer.active) throw new Error("Buyer ta bondho ache");

        const sale = await writeWholesaleSale({
          session,
          buyer: {
            id: buyer._id,
            name: buyer.name,
            shopName: buyer.shopName,
            phone: buyer.phone,
          },
          items: input.items,
          discountPercent: input.discountPercent,
          paidPaisa: input.paidPaisa,
          createdBy: adminSession.userId,
          orderId: null,
        });
        saleId = sale._id;
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
    revalidatePath("/wholesale");
    revalidatePath("/due");

    const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
    return toPlain(sale!);
  });
}

export async function getSale(id: string): Promise<Serialized<SaleDoc> | null> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const sale = await SaleModel.findById(id).lean<SaleDoc>();
  return sale ? toPlain(sale) : null;
}

/**
 * Cancels a sale and returns exactly the stock it took.
 *
 * Sales are never deleted: an invoice number that vanishes from the books
 * is an audit trail with a hole in it, and the number stays burned so it can
 * never be reissued to a different sale.
 *
 * The stock returned comes from each line's snapshotted `patasDeducted`,
 * not from recomputing boxes x patasPerBox — if the pack size changed after
 * the sale, recomputing would return a different quantity than went out.
 */
export async function cancelSale(
  id: string,
  reason: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    await requireAdminAction();
    await connectDb();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Bikri pawa jay ni");
    }
    if (typeof reason !== "string" || !reason.trim()) {
      throw new Error("Cancel korar karon likhte hobe");
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const sale = await SaleModel.findById(id).session(session);
        if (!sale) throw new Error("Bikri pawa jay ni");
        if (sale.status === "cancelled") {
          throw new Error("Ei bikri age theke cancel kora");
        }

        // Flip the status with the guard in the filter, so two concurrent
        // cancels cannot both pass and return the stock twice.
        const flipped = await SaleModel.updateOne(
          { _id: sale._id, status: "active" },
          {
            $set: {
              status: "cancelled",
              cancelledAt: new Date(),
              cancelReason: reason.trim(),
            },
          },
          { session },
        );
        if (flipped.matchedCount === 0) {
          throw new Error("Ei bikri age theke cancel kora");
        }

        for (const line of sale.items) {
          if (!line.medicineId) continue;

          // A positive delta, so this can only fail here if the medicine
          // itself no longer exists — applyStockDelta's only precondition.
          const ok = await applyStockDelta(
            line.medicineId,
            line.patasDeducted,
            session,
          );
          if (!ok) throw new Error("Medicine pawa jay ni");
        }
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
    revalidatePath("/due");
    revalidatePath("/retail-due");
  });
}

/**
 * Matches for the retail counter's phone-number autocomplete, replacing the
 * old single-match lookupRetailCustomer now that RetailCustomer persists a
 * durable per-phone record instead of re-deriving the latest name from Sale
 * history on every call. Returns at most 8 matches, most recently updated
 * first. A query shorter than 2 digits returns nothing, so a stray keystroke
 * doesn't fire a broad, useless match.
 */
export async function searchRetailCustomers(
  query: string,
): Promise<{ name: string; phone: string }[]> {
  await requireAdminAction();
  if (typeof query !== "string") throw new Error("query must be a string");

  const term = query.trim();
  if (term.length < 2) return [];

  await connectDb();

  const customers = await RetailCustomerModel.find({
    phone: { $regex: `^${escapeRegex(term)}` },
  })
    .sort({ updatedAt: -1 })
    .limit(8)
    .select("name phone")
    .lean<{ name: string; phone: string }[]>();

  return customers.map((c) => ({ name: c.name, phone: c.phone }));
}
```

Note: `toPlainList` is imported but unused directly in this file — remove it from the import line (only `toPlain` is used). Double-check before committing: `grep -n "toPlainList" src/actions/sales.ts` should return nothing after this edit; if it does, drop it from the import.

- [ ] **Step 2: Rewrite the retail-related sections of `tests/actions/sales.test.ts`**

Replace the `recordRetailSale`, `retail customer details`, and `lookupRetailCustomer` `describe` blocks (everything from `describe("recordRetailSale"` through the end of the `lookupRetailCustomer` block) with:

```ts
const percent = (p: number) => ({ kind: "percent" as const, percent: p });
const amount = (a: number) => ({ kind: "amount" as const, amountPaisa: a });

describe("recordRetailSale", () => {
  it("charges the khuchra rate and deducts stock", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 26000,
    }));

    expect(sale.type).toBe("retail");
    expect(sale.totalPaisa).toBe(26000);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(480);
  });

  it("assigns an invoice number", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.invoiceNo).toMatch(/^ABC-\d{6}$/);
  });

  it("has no buyer", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerId).toBeNull();
  });

  it("applies a percent discount", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(10),
      paidPaisa: 11700,
    }));
    expect(sale.discountPaisa).toBe(1300);
    expect(sale.totalPaisa).toBe(11700);
    expect(sale.duePaisa).toBe(0);
  });

  it("applies a flat amount discount", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: amount(500),
      paidPaisa: 12500,
    }));
    expect(sale.discountPaisa).toBe(500);
    expect(sale.totalPaisa).toBe(12500);
  });

  it("records a partial payment as a due when a phone is given", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim",
      customerPhone: "01711111111",
      discount: percent(0),
      paidPaisa: 5000,
    }));
    expect(sale.duePaisa).toBe(8000);
  });

  it("rejects a due with no phone", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 5000,
      })),
    ).rejects.toThrow("Baki rakhte hole phone number dite hobe");
  });

  it("allows a custom item", async () => {
    const sale = await unwrap(recordRetailSale({
      items: [{ customName: "Syringe", customPricePaisa: 2000, boxes: 2, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 4000,
    }));
    expect(sale.items[0].medicineId).toBeNull();
    expect(sale.totalPaisa).toBe(4000);
  });

  it("allows a zero-quantity line alongside a billable one", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const sale = await unwrap(recordRetailSale({
      items: [
        { medicineId: supplied._id, boxes: 1, patas: 0 },
        { medicineId: outOfStock._id, boxes: 0, patas: 0 },
      ],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.items).toHaveLength(2);
    expect(sale.totalPaisa).toBe(13000);
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 0, patas: 0 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("rejects an empty cart", async () => {
    await expect(
      unwrap(recordRetailSale({ items: [], customerName: "Walk-in", discount: percent(0), paidPaisa: 0 })),
    ).rejects.toThrow("Cart khali");
  });

  it("rejects a missing or blank name", async () => {
    const medicine = await makeMedicine();
    for (const customerName of ["", "   ", undefined as never]) {
      await expect(
        unwrap(recordRetailSale({
          items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
          customerName,
          discount: percent(0),
          paidPaisa: 13000,
        })),
      ).rejects.toThrow("Customer nam likhte hobe");
    }
  });

  it("rejects the same medicine listed twice", async () => {
    const medicine = await makeMedicine({}, 3);
    await expect(
      unwrap(recordRetailSale({
        items: [
          { medicineId: medicine._id, boxes: 0, patas: 2 },
          { medicineId: medicine._id, boxes: 0, patas: 1 },
        ],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Ekoi medicine dui bar add kora jabe na");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: "507f1f77bcf86cd799439011", boxes: 0, patas: 1 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow();
  });
});

describe("retail customer details", () => {
  it("stores the customer name and phone on the sale, trimmed", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "  Karim Uddin  ",
      customerPhone: "  01711111111  ",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerPhone).toBe("01711111111");
    expect(sale.buyerId).toBeNull();
  });

  it("treats the phone as optional when the sale is fully paid", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim Uddin",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerPhone).toBe("");
  });

  it("rejects a phone that is not a string", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        customerName: "Karim Uddin",
        customerPhone: 1711111111 as never,
        discount: percent(0),
        paidPaisa: 13000,
      })),
    ).rejects.toThrow("customerPhone must be a string");
  });
});

describe("searchRetailCustomers", () => {
  it("matches by phone prefix, most recently updated first", async () => {
    const medicine = await makeMedicine();
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim", customerPhone: "01711111111",
      discount: percent(0), paidPaisa: 13000,
    }));
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim Uddin", customerPhone: "01711111111",
      discount: percent(0), paidPaisa: 13000,
    }));

    const matches = await searchRetailCustomers("0171");
    expect(matches).toEqual([{ name: "Karim Uddin", phone: "01711111111" }]);
  });

  it("returns nothing for a query under 2 characters", async () => {
    expect(await searchRetailCustomers("0")).toEqual([]);
  });

  it("returns nothing for a phone never seen", async () => {
    expect(await searchRetailCustomers("0199")).toEqual([]);
  });

  it("rejects a non-admin caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(searchRetailCustomers("0171")).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
```

Also update the import line near the top of the file to drop `lookupRetailCustomer` and add `searchRetailCustomers`:

```ts
import {
  recordRetailSale,
  recordWholesaleSale,
  cancelSale,
  searchRetailCustomers,
} from "@/actions/sales";
```

And every other `recordRetailSale({...})` call elsewhere in the file (the `cancelSale`, `sale lines snapshot the medicine form` describe blocks) needs `discount: percent(0)` and `paidPaisa` matching its total added — go through each remaining call site in the file and add those two fields, matching the pre-existing total for that call so the sale still ends up fully paid with no due (no behavior change to the scenario under test).

- [ ] **Step 3: Fix the 4 pre-existing stale wholesale assertions in the same file**

In the `recordWholesaleSale` `describe` block, replace the `"rejects paying more than the total"` test:

```ts
  it("allows paying more than the total, recording a credit", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 99999,
    }));
    expect(sale.totalPaisa).toBe(12000);
    expect(sale.duePaisa).toBe(12000 - 99999);
  });
```

In the `zero-quantity wholesale lines` `describe` block, fix the 3 message-mismatch tests to match `validateSaleItems`'s actual messages:

```ts
  it("still rejects a negative quantity", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: -1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Box er poriman thik nai");
  });

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
    ).rejects.toThrow("Pata er poriman thik nai");
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
    ).rejects.toThrow("Pata er poriman thik nai");
  });
```

- [ ] **Step 4: Run and confirm green**

Run: `npx vitest run tests/actions/sales.test.ts`
Expected: all pass, zero failures (the pre-existing 4 are now fixed, retail is fully rewritten).

Run: `npx vitest run tests/actions/due.test.ts tests/lib/writeWholesaleSale.test.ts tests/lib/saleLines.test.ts tests/lib/writeRetailSale.test.ts tests/lib/saleTotals.test.ts`
Expected: all still pass (nothing in this task should touch these, but confirm no accidental regression from the `sales.ts` rewrite).

- [ ] **Step 5: Commit**

```bash
git add src/actions/sales.ts tests/actions/sales.test.ts
git commit -m "$(cat <<'EOF'
feat: rebuild recordRetailSale on writeRetailSale, add searchRetailCustomers

RetailSaleInput now matches wholesale's shape (custom items, discount
object, paidPaisa) minus buyerId. validateSaleItems is shared between
both sale types. lookupRetailCustomer is replaced by
searchRetailCustomers, which returns a list of matches from the new
RetailCustomer model instead of a single derived-from-history hit.
Also fixes 4 pre-existing stale assertions in this file (wrong error
message text, an overpayment-rejection that contradicts computeTotals'
documented behavior).
EOF
)"
```

---

### Task 7: Reports — retail summary card gets a due figure too

**Files:**
- Modify: `src/actions/reports.ts`
- Modify: `src/components/ReportView.tsx`

Once retail sales can carry a due, the report's retail summary card silently omitting it (while the wholesale card already shows one, and per-row `duePaisa` already renders generically for any row) reads as broken, not intentional. Small, direct fix — no test file exists for `reports.ts` today, so none is added; this is a type/display change, browser-verified in Task-14-adjacent verification.

- [ ] **Step 1: Widen the `retail` field's type in `src/actions/reports.ts`**

Change:
```ts
export type SalesReport = {
  fromDate: string;
  toDate: string;
  rows: SalesReportRow[];
  retail: SalesReportTotals;
  wholesale: SalesReportTotals & { duePaisa: number };
  grandTotalPaisa: number;
  cancelledCount: number;
};
```
to:
```ts
export type SalesReport = {
  fromDate: string;
  toDate: string;
  rows: SalesReportRow[];
  retail: SalesReportTotals & { duePaisa: number };
  wholesale: SalesReportTotals & { duePaisa: number };
  grandTotalPaisa: number;
  cancelledCount: number;
};
```

And change:
```ts
  const retail: SalesReportTotals = {
    count: retailRows.length,
    totalPaisa: sum(retailRows, "totalPaisa"),
  };
```
to:
```ts
  const retail: SalesReportTotals & { duePaisa: number } = {
    count: retailRows.length,
    totalPaisa: sum(retailRows, "totalPaisa"),
    duePaisa: sum(retailRows, "duePaisa"),
  };
```

- [ ] **Step 2: Show it in `src/components/ReportView.tsx`**

Replace:
```tsx
          <div className="mt-1 text-xs text-muted">{report.retail.count} ta</div>
```
with:
```tsx
          <div className="mt-1 text-xs text-muted">
            {report.retail.count} ta · baki {formatTaka(report.retail.duePaisa)}
          </div>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/reports.ts src/components/ReportView.tsx
git commit -m "$(cat <<'EOF'
fix: show retail baki on the sales report summary card

Retail sales can now carry a due (see writeRetailSale); the report's
retail card was the one place that stayed silent about it while every
other surface (per-row duePaisa, the wholesale card) already showed it.
EOF
)"
```

---

### Task 8: Invoice printing for retail sales

**Files:**
- Modify: `src/app/(admin)/invoice/[id]/page.tsx`

`Invoice.tsx` and `cancelSale` are already fully generic — this task only removes the type gate. `cancelSale`'s extra `revalidatePath("/retail-due")` was already added in Task 6.

- [ ] **Step 1: Remove the wholesale-only gate**

In `src/app/(admin)/invoice/[id]/page.tsx`, delete:
```tsx
  // Only wholesale sales have invoice numbers and are printable.
  if (sale.type !== "wholesale") notFound();
```

`notFound()` is still needed for the `if (!sale) notFound();` line above it — leave that one. A retail sale written before this plan shipped still has `invoiceNo: null` and is still unprintable in practice (there's nothing to print), but it's no longer explicitly blocked by type — it simply renders with an empty invoice number if ever visited directly, which is an existing edge the page already tolerates (`invoiceNo={sale.invoiceNo ?? ""}`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (confirm `notFound` is still used elsewhere in the file so the import doesn't become unused — it is, for the `!sale` case).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(admin)/invoice/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: allow retail sales to be printed at /invoice/[id]

Invoice.tsx and cancelSale were already type-agnostic; only this
page's explicit wholesale-only gate stood in the way.
EOF
)"
```

---

### Task 9: `RetailDueTable` / `RetailLedger` components

**Files:**
- Create: `src/components/RetailDueTable.tsx`
- Create: `src/components/RetailLedger.tsx`

**Interfaces:**
- Consumes: `RetailDueRow`, `RetailLedgerResult`, `recordRetailPayment` (Task 4).
- Produces: `RetailDueTable`, `RetailLedger` components. Task 10 depends on both.

No test file — this codebase has no component tests; verified by browser check alongside Task 12.

- [ ] **Step 1: Write `src/components/RetailLedger.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatTaka } from "@/lib/money";
import { describeDue } from "@/lib/dueDisplay";
import { recordRetailPayment, type RetailLedgerResult } from "@/actions/due";
import { card, input, btnPrimary, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

type Props = {
  phone: string;
  customerName: string;
  duePaisa: number;
  ledger: RetailLedgerResult;
  onClose: () => void;
};

type Entry = {
  id: string;
  date: Date;
  type: "sale" | "payment";
  desc: string;
  debit: number;
  credit: number;
  link?: string;
};

export function RetailLedger({ phone, customerName, duePaisa, ledger, onClose }: Props) {
  const router = useRouter();
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentDue = describeDue(duePaisa);
  const entries: Entry[] = [];

  for (const s of ledger.sales) {
    if (s.status === "cancelled") continue;
    entries.push({
      id: s._id as string,
      date: new Date(s.createdAt),
      type: "sale",
      desc: `Invoice ${s.invoiceNo}`,
      debit: s.duePaisa,
      credit: 0,
      link: `/invoice/${s._id}`,
    });
  }

  for (const p of ledger.payments) {
    entries.push({
      id: p._id as string,
      date: new Date(p.createdAt),
      type: "payment",
      desc: p.note ? `Joma — ${p.note}` : "Joma",
      debit: 0,
      credit: p.amountPaisa,
    });
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  const rows = entries.map((e) => {
    runningBalance = runningBalance + e.debit - e.credit;
    return { ...e, balance: runningBalance };
  });
  rows.reverse();

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await recordRetailPayment(phone, Number(payAmount), payNote);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPayAmount("");
      setPayNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const td = tdCls;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <button onClick={onClose} className="mb-1 text-xs font-semibold text-muted hover:text-brand-strong">
            ← Khuchra Baki
          </button>
          <h2 className="font-display text-lg font-extrabold text-ink">{customerName || "(naam nai)"}</h2>
          <p className="text-sm text-muted">{phone}</p>
          <p className={`text-sm font-semibold ${currentDue.className}`}>
            {currentDue.label !== "Baki nei" ? `${currentDue.label}: ${currentDue.amountText}` : currentDue.label}
          </p>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="mb-3 font-display text-sm font-bold text-ink">Joma nin</h3>
        <form onSubmit={handlePayment} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted">Taka</label>
            <input type="number" step="0.01" min={0} required className={input}
              value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-muted">Note</label>
            <input type="text" className={input} placeholder="Cash / Bank"
              value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          <button type="submit" disabled={busy || !payAmount} className={btnPrimary}>
            {busy ? "Wait..." : "Joma add koro"}
          </button>
        </form>
        {error && <p role="alert" className={`mt-3 ${errorBox}`}>{error}</p>}
      </div>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Biboron</th>
              <th className={`${th} text-right`}>Baki (৳)</th>
              <th className={`${th} text-right`}>Joma (৳)</th>
              <th className={`${th} text-right`}>Balance (৳)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowBalance = describeDue(r.balance);
              return (
                <tr key={r.id} className={trow}>
                  <td className={`${td} text-muted`}>
                    {r.date.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}
                  </td>
                  <td className={td}>
                    {r.link ? (
                      <Link href={r.link} className="font-medium text-brand-strong hover:underline">{r.desc}</Link>
                    ) : (
                      r.desc
                    )}
                  </td>
                  <td className={`${td} text-right text-danger`}>{r.debit > 0 ? formatTaka(r.debit) : "—"}</td>
                  <td className={`${td} text-right text-brand-strong`}>{r.credit > 0 ? formatTaka(r.credit) : "—"}</td>
                  <td className={`${td} text-right font-medium ${rowBalance.className}`}>
                    {rowBalance.label !== "Baki nei" ? `${rowBalance.amountText} (${rowBalance.label})` : rowBalance.amountText}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-sm text-muted">Kono record nai.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/RetailDueTable.tsx`**

```tsx
"use client";

import { useState } from "react";
import { formatTaka } from "@/lib/money";
import { describeDue, splitDueTotals } from "@/lib/dueDisplay";
import type { RetailDueRow, RetailLedgerResult } from "@/actions/due";
import { RetailLedger } from "./RetailLedger";
import { card, thead, th, td as tdCls, trow, errorBox } from "@/components/ui";

type Props = {
  dues: RetailDueRow[];
  fetchLedger: (phone: string) => Promise<RetailLedgerResult>;
};

export function RetailDueTable({ dues, fetchLedger }: Props) {
  const [openLedger, setOpenLedger] = useState<{
    phone: string;
    name: string;
    duePaisa: number;
    data: RetailLedgerResult;
  } | null>(null);
  const [loadingPhone, setLoadingPhone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? dues.filter((row) => row.customerName.toLowerCase().includes(search.toLowerCase()))
    : dues;

  async function handleOpen(row: RetailDueRow) {
    setLoadingPhone(row.phone);
    setError("");
    try {
      const data = await fetchLedger(row.phone);
      setOpenLedger({ phone: row.phone, name: row.customerName, duePaisa: row.duePaisa, data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setLoadingPhone(null);
    }
  }

  if (openLedger) {
    return (
      <RetailLedger
        phone={openLedger.phone}
        customerName={openLedger.name}
        duePaisa={openLedger.duePaisa}
        ledger={openLedger.data}
        onClose={() => setOpenLedger(null)}
      />
    );
  }

  const td = tdCls;
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">Khuchra Baki</h1>
            <p className="text-sm text-white/90">Khuchra customer der baki hisab.</p>
          </div>
          <div className="text-left md:text-right">
            <div className="text-sm text-white/80">Mot baki</div>
            <div className="font-display text-3xl font-extrabold text-yellow-300">{formatTaka(totalDuePaisa)}</div>
            {totalCreditPaisa > 0 && (
              <div className="mt-1 text-xs font-medium text-white/90">
                Customer der joma ache: {formatTaka(totalCreditPaisa)}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-10 mt-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer er nam diye khojo..."
            className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:bg-white focus:text-ink focus:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-white transition"
          />
        </div>
      </section>

      {error && <p role="alert" className={`${errorBox} mb-4 mx-2`}>{error}</p>}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full">
          <thead className={thead}>
            <tr>
              <th className={th}>Customer</th>
              <th className={`${th} text-right`}>Hisab (৳)</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const due = describeDue(row.duePaisa);
              return (
                <tr key={row.phone} className={trow}>
                  <td className={td}>
                    <div className="font-semibold text-ink">{row.customerName || "(naam nai)"}</div>
                    <div className="text-xs text-muted">{row.phone}</div>
                  </td>
                  <td className={`${td} text-right font-medium ${due.className}`}>
                    {due.label !== "Baki nei" ? `${due.label} ${due.amountText}` : due.label}
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      onClick={() => handleOpen(row)}
                      disabled={loadingPhone === row.phone}
                      className="rounded-full px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-brand-tint disabled:opacity-50"
                    >
                      {loadingPhone === row.phone ? "Khulche..." : "Hisab dekhun"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-sm text-muted">
                  {search.trim() ? `"${search}" e kono customer pawa jay ni.` : "Kono baki nai."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (both files are new and only import types produced by Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/components/RetailDueTable.tsx src/components/RetailLedger.tsx
git commit -m "$(cat <<'EOF'
feat: RetailDueTable/RetailLedger components

Phone-keyed clones of DueTable/BuyerLedger for the Khuchra Baki page.
EOF
)"
```

---

### Task 10: `/retail-due` page + nav links

**Files:**
- Create: `src/app/(admin)/retail-due/page.tsx`
- Modify: `src/components/AdminNav.tsx`
- Modify: `src/components/AdminBottomNav.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { listRetailDues, retailLedger } from "@/actions/due";
import { RetailDueTable } from "@/components/RetailDueTable";

export default async function RetailDuePage() {
  const dues = await listRetailDues();

  async function fetchLedger(phone: string) {
    "use server";
    return retailLedger(phone);
  }

  return <RetailDueTable dues={dues} fetchLedger={fetchLedger} />;
}
```

- [ ] **Step 2: Add the nav link in `src/components/AdminNav.tsx`**

In the `LINKS` array, add after the `/due` entry:
```ts
  { href: "/due", label: "Baki Khata" },
  { href: "/retail-due", label: "Khuchra Baki" },
```

- [ ] **Step 3: Add the nav link in `src/components/AdminBottomNav.tsx`**

In the `MORE` array, add after the `/due` entry:
```ts
  { href: "/due", label: "Baki Khata" },
  { href: "/retail-due", label: "Khuchra Baki" },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/retail-due/page.tsx" src/components/AdminNav.tsx src/components/AdminBottomNav.tsx
git commit -m "$(cat <<'EOF'
feat: /retail-due page and nav entries

EOF
)"
```

---

### Task 11: Extract `SaleItemPicker`, refactor `WholesaleSaleForm` onto it

**Files:**
- Create: `src/components/SaleItemPicker.tsx`
- Modify: `src/components/WholesaleSaleForm.tsx`

**Interfaces:**
- Produces: `SaleItemPicker` component, `CartLine` type (moved here, canonical for both forms). Task 12 depends on both.

No test file (no component tests in this codebase) — verified by browser check: the wholesale flow must look and behave identically after this refactor, since it's a pure extraction, not a redesign.

- [ ] **Step 1: Write `src/components/SaleItemPicker.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { listMedicines } from "@/actions/medicines";
import { toMedicineForm } from "@/lib/unitLabels";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { type PickedMedicine } from "./MedicinePicker";

export type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
  patas: number;
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function SaleItemPicker({
  cart,
  priceMode,
  allowCustomItems,
  onAdd,
  onRemove,
  onQuantityChange,
  onAddCustom,
  onProceed,
}: {
  cart: CartLine[];
  priceMode: "retail" | "wholesale";
  allowCustomItems: boolean;
  onAdd: (medicine: PickedMedicine, boxes: number, patas: number) => void;
  onRemove: (medicineId: string) => void;
  onQuantityChange: (medicineId: string, boxes: number, patas: number) => void;
  onAddCustom: (medicine: PickedMedicine, boxes: number) => void;
  onProceed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customBoxes, setCustomBoxes] = useState(1);

  const [step1Boxes, setStep1Boxes] = useState<Record<string, number>>({});
  const [step1Patas, setStep1Patas] = useState<Record<string, number>>({});

  const inCartSet = new Set(cart.map((l) => l.medicine.id));

  function addCustomItem() {
    if (!customName.trim()) {
      alert("Product name dite hobe");
      return;
    }
    const pricePaisa = Math.round(takaToPaisa(customPrice || 0));
    if (pricePaisa < 0) {
      alert("Price thik nai");
      return;
    }
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const customMed: PickedMedicine = {
      id,
      name: customName.trim(),
      genericName: "Custom Item",
      form: "other",
      patasPerBox: 1,
      wholesaleBoxPricePaisa: pricePaisa,
      wholesalePataPricePaisa: pricePaisa,
      retailBoxPricePaisa: pricePaisa,
      retailPataPricePaisa: pricePaisa,
      stockPatas: 0,
    };

    setStep1Boxes((prev) => ({ ...prev, [id]: customBoxes }));
    onAddCustom(customMed, customBoxes);

    setCustomName("");
    setCustomPrice("");
    setCustomBoxes(1);
    setShowCustomForm(false);
  }

  useEffect(() => {
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await listMedicines(query);
        if (cancelled) return;
        setResults(
          found.map((m) => ({
            id: m._id,
            name: m.name,
            genericName: m.genericName,
            form: toMedicineForm(m.form),
            patasPerBox: m.patasPerBox,
            wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
            wholesalePataPricePaisa: m.wholesalePataPricePaisa,
            retailBoxPricePaisa: m.retailBoxPricePaisa,
            retailPataPricePaisa: m.retailPataPricePaisa,
            stockPatas: m.stockPatas,
          })),
        );
      } catch {
        if (!cancelled) setError("Medicine khoja jacche na");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function handleBoxesChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Boxes((prev) => ({ ...prev, [m.id]: valid }));
    if (inCartSet.has(m.id)) {
      onQuantityChange(m.id, valid, step1Patas[m.id] ?? 0);
    }
  }

  function handlePatasChange(m: PickedMedicine, val: number) {
    const valid = Math.max(0, val);
    setStep1Patas((prev) => ({ ...prev, [m.id]: valid }));
    if (inCartSet.has(m.id)) {
      onQuantityChange(m.id, step1Boxes[m.id] ?? 1, valid);
    }
  }

  function toggleCart(medicine: PickedMedicine, checked: boolean) {
    if (checked) {
      onAdd(medicine, step1Boxes[medicine.id] ?? 1, step1Patas[medicine.id] ?? 0);
    } else {
      onRemove(medicine.id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-4 bg-surface px-4 py-3 shadow-sm border-b border-line sm:-mx-0 sm:rounded-3xl sm:px-5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Medicine search করুন..."
            className="w-full rounded-full border border-line bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-ink shadow-sm placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      <div className="mb-2">
        <p className="font-bold text-brand-strong text-sm">
          {searching ? "খোঁজা হচ্ছে..." : `${results.length} টি পণ্য`}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}

      {results.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm border border-line overflow-hidden">
          <div className="grid grid-cols-[1fr_75px_75px_40px] gap-1 border-b border-line bg-canvas/50 px-2 py-3 text-[11px] font-bold text-ink">
            <div>Product</div>
            <div className="text-center">Box</div>
            <div className="text-center">Pata</div>
            <div className="text-center">Sel</div>
          </div>

          <div className="divide-y divide-line">
            {[
              ...results,
              ...cart.filter((l) => l.medicine.id.startsWith("custom_")).map((l) => l.medicine),
            ].map((m) => {
              const inCart = inCartSet.has(m.id);
              const boxes = step1Boxes[m.id] ?? 1;
              const patas = step1Patas[m.id] ?? 0;
              const boxRate = priceMode === "wholesale" ? m.wholesaleBoxPricePaisa : m.retailBoxPricePaisa;

              return (
                <div key={m.id} className="grid grid-cols-[1fr_75px_75px_40px] items-center gap-1 p-2">
                  <div className="min-w-0 pr-1">
                    <div className="break-words font-display text-xs font-extrabold uppercase text-brand-strong leading-snug">
                      {m.name}
                    </div>
                    <div className="break-words text-[10px] text-muted">{m.genericName}</div>
                    <div className="mt-1 flex flex-col gap-0.5 text-[10px] font-medium text-muted">
                      <span className="text-ink">Rate: {formatTaka(boxRate)}</span>
                      <span className={m.stockPatas < 0 ? "text-danger font-bold" : ""}>
                        Stock: {Math.floor(m.stockPatas / m.patasPerBox)} box
                      </span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                    <button type="button" onClick={() => handleBoxesChange(m, boxes - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                    <input type="number" min={0} value={boxes} onChange={(e) => handleBoxesChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                    <button type="button" onClick={() => handleBoxesChange(m, boxes + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
                  </div>

                  <div className={`flex items-center justify-center rounded-lg border ${inCart ? "border-brand" : "border-line"} h-[28px] w-full px-0.5`}>
                    <button type="button" onClick={() => handlePatasChange(m, patas - 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>−</button>
                    <input type="number" min={0} value={patas} onChange={(e) => handlePatasChange(m, Number(e.target.value))} className={`w-5 border-0 bg-transparent p-0 text-center text-xs font-bold focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${inCart ? "text-ink" : "text-muted"}`} />
                    <button type="button" onClick={() => handlePatasChange(m, patas + 1)} className={`grid h-full flex-1 place-items-center text-sm font-bold ${inCart ? "text-brand" : "text-muted"}`}>+</button>
                  </div>

                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={inCart}
                      onChange={(e) => toggleCart(m, e.target.checked)}
                      className="h-5 w-5 rounded border-line text-brand focus:ring-brand disabled:opacity-50"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">"{query}" নামে কোনো মেডিসিন পাওয়া যায়নি।</p>
      )}

      {allowCustomItems && (
        <div className={`fixed right-4 z-40 flex flex-col items-end md:right-12 ${cart.length > 0 ? "bottom-[150px] sm:bottom-[150px] md:bottom-28" : "bottom-[90px] sm:bottom-[90px] md:bottom-20"}`}>
          {showCustomForm ? (
            <div className="mb-2 w-[300px] rounded-3xl border border-line bg-surface p-5 shadow-2xl">
              <h4 className="mb-4 text-sm font-bold text-brand-strong">Add Custom Item</h4>
              <div className="flex flex-col gap-3">
                <input
                  placeholder="Item name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Price"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    min={1}
                    value={customBoxes}
                    onChange={(e) => setCustomBoxes(Number(e.target.value) || 1)}
                    className="w-24 rounded-xl border border-line px-4 py-3 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none transition"
                  />
                </div>
                <div className="mt-2 flex gap-3">
                  <button onClick={addCustomItem} className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-strong transition">
                    Add
                  </button>
                  <button onClick={() => setShowCustomForm(false)} className="rounded-xl border border-line bg-canvas px-5 py-3 text-sm font-bold text-ink hover:bg-line/50 transition">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="flex items-center gap-2 rounded-full bg-brand-strong px-5 py-3 text-sm font-bold text-white shadow-xl shadow-brand-strong/30 hover:bg-brand-deep transition-transform hover:scale-105 active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Custom Item
            </button>
          )}
        </div>
      )}

      {cart.length > 0 && (
        <div className="sticky bottom-20 z-20 mt-6 md:bottom-4">
          <button
            type="button"
            onClick={onProceed}
            className="flex w-full items-center justify-between rounded-full bg-brand px-6 py-4 font-bold text-white shadow-xl shadow-brand/30 transition hover:bg-brand-strong"
          >
            <span className="text-base">Checkout a jan</span>
            <span className="font-display text-xl font-extrabold">{cart.length} ti product</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Refactor `src/components/WholesaleSaleForm.tsx`**

Replace the `import { type PickedMedicine } from "./MedicinePicker";` line and everything from the `type CartLine` declaration down through the `removeLine` function (i.e. drop the local `CartLine` type, `listMedicines`/`toMedicineForm` imports if now otherwise unused, the search/custom-item/step1 state and handlers: `query`, `results`, `searching`, `showCustomForm`, `customName`, `customPrice`, `customBoxes`, `addCustomItem`, the search `useEffect`, `step1Boxes`, `step1Patas`, `handleStep1BoxesChange`, `handleStep1PatasChange`, `toggleCart`) with:

```tsx
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";
import { type PickedMedicine } from "./MedicinePicker";
```

Keep `updateBoxes`, `updatePatas`, `removeLine` (still used by the step-2 table), `handleSubmit`, `lineTotalFor`, the `computeTotals` preview, `buyerId`/`discount`/`paid`/`error`/`busy`/`lastInvoice`/`lastSaleId`/`step` state.

Add new handlers where the removed ones used to be:

```tsx
  function handleAdd(medicine: PickedMedicine, boxes: number, patas: number) {
    setCart((prev) => {
      if (prev.find((l) => l.medicine.id === medicine.id)) return prev;
      return [...prev, { medicine, boxes, patas }];
    });
  }
  function handleRemoveFromPicker(medicineId: string) {
    setCart((prev) => prev.filter((l) => l.medicine.id !== medicineId));
  }
  function handleQuantityChangeFromPicker(medicineId: string, boxes: number, patas: number) {
    setCart((prev) => prev.map((l) => (l.medicine.id === medicineId ? { ...l, boxes, patas } : l)));
  }
  function handleAddCustom(medicine: PickedMedicine, boxes: number) {
    setCart((prev) => [...prev, { medicine, boxes, patas: 0 }]);
  }
```

In `handleSubmit`'s success branch, remove the `setQuery("");` line (query no longer exists in this scope — `SaleItemPicker` remounts fresh with empty search state every time `step` returns to `1`, since it and the step-2 `<form>` occupy the same conditional slot and are different component types).

Replace the entire step-1 JSX block (the `<div className="space-y-4">...` through its closing `</div>`, i.e. everything currently rendered when `step === 1`) with:

```tsx
        <SaleItemPicker
          cart={cart}
          priceMode="wholesale"
          allowCustomItems={allowCustomItems}
          onAdd={handleAdd}
          onRemove={handleRemoveFromPicker}
          onQuantityChange={handleQuantityChangeFromPicker}
          onAddCustom={handleAddCustom}
          onProceed={() => setStep(2)}
        />
```

The step-2 `<form>` block is unchanged.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors — in particular, confirm no leftover unused imports/vars flagged (e.g. `listMedicines`, `toMedicineForm` should no longer be imported in `WholesaleSaleForm.tsx` if nothing else there uses them).

- [ ] **Step 4: Run the wholesale tests once more (belt-and-braces — this task touches no lib/action code, but confirm nothing broke)**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts`
Expected: all pass.

- [ ] **Step 5: Browser-verify wholesale is unchanged**

Start the dev server, log in as admin, go to `/wholesale`. Confirm: searching still filters, box/pata steppers still work, adding a custom item still works, checking a box still adds to cart, "Checkout a jan" still moves to step 2 with the same cart, step 2's table/discount/paid/totals/submit still work exactly as before this refactor.

- [ ] **Step 6: Commit**

```bash
git add src/components/SaleItemPicker.tsx src/components/WholesaleSaleForm.tsx
git commit -m "$(cat <<'EOF'
refactor: extract SaleItemPicker from WholesaleSaleForm's step 1

Pure extraction, price-mode-parameterized, so RetailSaleForm can reuse
the exact same search/steppers/custom-item UI at retail prices instead
of a hand-duplicated copy. Wholesale's own behavior is unchanged.
EOF
)"
```

---

### Task 12: Rebuild `RetailSaleForm` as a two-step form

**Files:**
- Modify: `src/components/RetailSaleForm.tsx` (full rewrite)

**Interfaces:**
- Consumes: `SaleItemPicker`, `CartLine` (Task 11), `recordRetailSale`, `searchRetailCustomers` (Task 6), `computeTotals`, `DiscountInput` (Task 1).

`src/app/(admin)/sell/page.tsx` needs no change — it already just renders `<RetailSaleForm />` with no props.

- [ ] **Step 1: Rewrite `src/components/RetailSaleForm.tsx` in full**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordRetailSale, searchRetailCustomers } from "@/actions/sales";
import { SaleItemPicker, type CartLine } from "./SaleItemPicker";
import { type PickedMedicine } from "./MedicinePicker";
import { formatTaka, takaToPaisa } from "@/lib/money";
import { computeTotals } from "@/lib/saleTotals";
import { unitLabelsFor } from "@/lib/unitLabels";
import { parseQuantityInput } from "@/lib/quantityInput";

export function RetailSaleForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneMatches, setPhoneMatches] = useState<{ name: string; phone: string }[]>([]);
  const [showMatches, setShowMatches] = useState(false);

  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discountPercentInput, setDiscountPercentInput] = useState("");
  const [discountAmountInput, setDiscountAmountInput] = useState("");
  const [paid, setPaid] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  function handleAdd(medicine: PickedMedicine, boxes: number, patas: number) {
    setCart((prev) => {
      if (prev.find((l) => l.medicine.id === medicine.id)) return prev;
      return [...prev, { medicine, boxes, patas }];
    });
  }
  function handleRemoveFromPicker(medicineId: string) {
    setCart((prev) => prev.filter((l) => l.medicine.id !== medicineId));
  }
  function handleQuantityChangeFromPicker(medicineId: string, boxes: number, patas: number) {
    setCart((prev) => prev.map((l) => (l.medicine.id === medicineId ? { ...l, boxes, patas } : l)));
  }
  function handleAddCustom(medicine: PickedMedicine, boxes: number) {
    setCart((prev) => [...prev, { medicine, boxes, patas: 0 }]);
  }

  // Phone-number autocomplete, debounced for the same reason every other
  // type-ahead in this app is (see MedicinePicker).
  useEffect(() => {
    const phone = customerPhone.trim();
    if (phone.length < 2) {
      setPhoneMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchRetailCustomers(phone);
        if (!cancelled) setPhoneMatches(found);
      } catch {
        // A broken autocomplete must never block a counter sale.
        if (!cancelled) setPhoneMatches([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  function pickMatch(match: { name: string; phone: string }) {
    setCustomerPhone(match.phone);
    setCustomerName(match.name);
    setPhoneMatches([]);
    setShowMatches(false);
  }

  function lineTotalFor(line: CartLine): number {
    return line.boxes * line.medicine.retailBoxPricePaisa + line.patas * line.medicine.retailPataPricePaisa;
  }

  const subtotalPaisa = cart.reduce((sum, line) => sum + lineTotalFor(line), 0);
  const hasBillableLine = cart.some(
    (line) => line.boxes > 0 || line.patas > 0 || line.medicine.id.startsWith("custom_"),
  );
  const paidPaisa = Math.round(takaToPaisa(paid || 0));

  const discountPercentValue = Number(discountPercentInput || 0);
  const discountAmountValue = Math.round(takaToPaisa(discountAmountInput || 0));

  let totalPaisa = subtotalPaisa;
  let duePaisa = 0;
  let discountPaisa = 0;
  let displayedDiscountPercent = 0;
  let totalsError = "";
  try {
    const totals = computeTotals(
      cart.map((line) => ({ ratePaisa: lineTotalFor(line), quantity: 1 })),
      discountMode === "percent"
        ? { kind: "percent", percent: discountPercentValue }
        : { kind: "amount", amountPaisa: discountAmountValue },
      paidPaisa,
    );
    discountPaisa = totals.discountPaisa;
    totalPaisa = totals.totalPaisa;
    duePaisa = totals.duePaisa;
    displayedDiscountPercent = totals.discountPercent;
  } catch (err) {
    totalsError = err instanceof Error ? err.message : "Kichu ekta bhul holo";
  }

  // The inactive box always shows the live-derived number, so there is only
  // ever one authoritative value (discountMode) and one display of it.
  const shownPercentBox =
    discountMode === "percent" ? discountPercentInput : String(displayedDiscountPercent || "");
  const shownAmountBox =
    discountMode === "amount" ? discountAmountInput : (discountPaisa / 100).toFixed(2);

  const needsPhoneForDue = duePaisa > 0 && !customerPhone.trim();

  function updateBoxes(idx: number, raw: string) {
    const boxes = parseQuantityInput(raw, 0);
    setCart((prev) => prev.map((line, i) => (i === idx ? { ...line, boxes } : line)));
  }
  function updatePatas(idx: number, raw: string) {
    const patas = parseQuantityInput(raw, 0);
    setCart((prev) => prev.map((line, i) => (i === idx ? { ...line, patas } : line)));
  }
  function removeLine(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) {
      setError("Cart khali");
      return;
    }
    if (!hasBillableLine) {
      setError("Onto ekta line e poriman dite hobe");
      return;
    }
    if (!customerName.trim()) {
      setError("Customer nam likhte hobe");
      return;
    }
    if (needsPhoneForDue) {
      setError("Baki rakhte hole phone number dite hobe");
      return;
    }
    setError("");
    setBusy(true);

    try {
      const payloadItems = cart.map((l) => {
        if (l.medicine.id.startsWith("custom_")) {
          return {
            customName: l.medicine.name,
            customPricePaisa: l.medicine.retailBoxPricePaisa,
            boxes: l.boxes,
            patas: l.patas,
          };
        }
        return { medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas };
      });

      const result = await recordRetailSale({
        items: payloadItems,
        customerName,
        customerPhone,
        discount:
          discountMode === "percent"
            ? { kind: "percent", percent: discountPercentValue }
            : { kind: "amount", amountPaisa: discountAmountValue },
        paidPaisa,
      });
      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }
      const sale = result.data;
      setCart([]);
      setDiscountPercentInput("");
      setDiscountAmountInput("");
      setDiscountMode("percent");
      setPaid("");
      setCustomerName("");
      setCustomerPhone("");
      setLastInvoice(sale.invoiceNo as string | null);
      setLastSaleId(sale._id);
      setStep(1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition";
  const tdCls = "px-4 py-3 text-sm";

  return (
    <div className="flex flex-col pb-6">
      <section className="-mx-4 -mt-4 mb-6 sm:-mx-6 sm:-mt-6 rounded-b-3xl bg-gradient-to-br from-brand to-brand-deep px-6 pb-8 pt-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/3 translate-x-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-0 bottom-0 translate-y-1/3 -translate-x-1/3 h-48 w-48 rounded-full bg-black/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
              <span className="text-yellow-300">🏪</span> Khuchra
            </div>
            <h1 className="mb-1 font-display text-3xl font-extrabold leading-tight">
              {step === 1 ? "Notun Bikri" : "Checkout"}
            </h1>
            <p className="text-sm text-white/90">
              {step === 1 ? "Product khuje cart e add korun." : "Order final koro."}
            </p>
          </div>
          {step === 2 && (
            <button onClick={() => setStep(1)} className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30 transition backdrop-blur-sm">
              ← Piche ferot
            </button>
          )}
        </div>
      </section>

      {lastInvoice && lastSaleId && (
        <div className="mb-6 flex flex-col items-center justify-center rounded-3xl bg-surface border-2 border-brand p-8 text-center shadow-lg">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint mb-4 text-3xl">🎉</div>
          <h3 className="mb-2 font-display text-xl font-bold text-ink">Invoice {lastInvoice} record kora hoyeche!</h3>
          <p className="mb-6 text-muted">Order successfully save hoyeche, ebar invoice print korte paren.</p>
          <Link href={`/invoice/${lastSaleId}`} className="rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-xl shadow-brand/30 hover:bg-brand-strong transition">
            🖨️ Invoice Print Koro
          </Link>
        </div>
      )}

      {step === 1 ? (
        <SaleItemPicker
          cart={cart}
          priceMode="retail"
          allowCustomItems
          onAdd={handleAdd}
          onRemove={handleRemoveFromPicker}
          onQuantityChange={handleQuantityChangeFromPicker}
          onAddCustom={handleAddCustom}
          onProceed={() => setStep(2)}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-md sm:grid-cols-2">
            <div className="relative space-y-1.5">
              <label htmlFor="customerPhone" className="text-sm font-medium text-ink">Customer phone (optional)</label>
              <input
                id="customerPhone"
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  setShowMatches(true);
                }}
                onFocus={() => setShowMatches(true)}
                onBlur={() => setTimeout(() => setShowMatches(false), 150)}
                placeholder="01XXXXXXXXX"
                className={field}
              />
              {showMatches && phoneMatches.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-lg">
                  {phoneMatches.map((m) => (
                    <li key={m.phone}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickMatch(m)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-brand-tint"
                      >
                        <span className="font-semibold text-ink">{m.name}</span>
                        <span className="text-xs text-muted">{m.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="customerName" className="text-sm font-medium text-ink">Customer nam</label>
              <input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nam likho"
                className={field}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-line bg-surface shadow-md">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-muted bg-canvas/50">
                <tr>
                  <th className={tdCls}>Medicine</th>
                  <th className={tdCls}>Rate</th>
                  <th className={tdCls}>Poriman</th>
                  <th className={`${tdCls} text-right`}>Mot</th>
                  <th className={tdCls}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, idx) => (
                  <tr key={line.medicine.id} className="border-b border-line/50 last:border-0">
                    <td className={tdCls}>
                      <div className="font-bold text-ink">{line.medicine.name}</div>
                      <div className="text-xs font-medium text-muted mt-0.5">{line.medicine.genericName}</div>
                    </td>
                    <td className={tdCls}>{formatTaka(line.medicine.retailBoxPricePaisa)}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        <input type="number" min={0} value={line.boxes} onChange={(e) => updateBoxes(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition" />
                        <span className="text-xs font-medium text-muted">{unitLabelsFor(line.medicine.form).outer}</span>
                        <input type="number" min={0} value={line.patas} onChange={(e) => updatePatas(idx, e.target.value)}
                          className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition" />
                        <span className="text-xs font-medium text-muted">{unitLabelsFor(line.medicine.form).inner}</span>
                      </div>
                      {line.boxes === 0 && line.patas === 0 && (
                        <div className="mt-1 text-[11px] font-medium text-muted">invoice e thakbe, dam nai</div>
                      )}
                    </td>
                    <td className={`${tdCls} text-right font-bold text-ink`}>{formatTaka(lineTotalFor(line))}</td>
                    <td className={tdCls}>
                      <button type="button" onClick={() => removeLine(idx)} className="text-muted hover:text-danger rounded-full p-1 hover:bg-danger-bg transition">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 rounded-3xl border border-line bg-surface p-5 shadow-md sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Discount</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input type="number" step="0.01" className={field} placeholder="%"
                    value={shownPercentBox}
                    onChange={(e) => {
                      setDiscountMode("percent");
                      setDiscountPercentInput(e.target.value);
                    }} />
                  <p className="mt-1 text-[11px] text-muted">Percent</p>
                </div>
                <div className="flex-1">
                  <input type="number" step="0.01" min={0} className={field} placeholder="৳"
                    value={shownAmountBox}
                    onChange={(e) => {
                      setDiscountMode("amount");
                      setDiscountAmountInput(e.target.value);
                    }} />
                  <p className="mt-1 text-[11px] text-muted">Amount (৳)</p>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="paid" className="text-sm font-medium text-ink">Joma (৳)</label>
              <input id="paid" type="number" step="0.01" min={0} className={field}
                placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
            </div>
            <div className="space-y-3 rounded-2xl bg-brand/5 p-4 border border-brand/10">
              <div className="flex justify-between text-sm text-muted">
                <span>Subtotal</span>
                <span>{formatTaka(subtotalPaisa)}</span>
              </div>
              {discountPaisa > 0 && (
                <div className="flex justify-between text-sm text-muted">
                  <span>Discount ({displayedDiscountPercent}%)</span>
                  <span>− {formatTaka(discountPaisa)}</span>
                </div>
              )}
              {totalsError ? (
                <p role="alert" className="text-sm text-danger">{totalsError}</p>
              ) : (
                <>
                  <div className="flex justify-between text-sm font-display font-bold text-ink">
                    <span>Mot</span>
                    <span>{formatTaka(totalPaisa)}</span>
                  </div>
                  {duePaisa >= 0 ? (
                    <div className="flex justify-between text-sm font-semibold text-danger">
                      <span>Baki</span>
                      <span>{formatTaka(duePaisa)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm font-semibold text-teal-700">
                      <span>Customer pabe</span>
                      <span>{formatTaka(Math.abs(duePaisa))}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {cart.length > 0 && !hasBillableLine && (
            <p className="text-sm text-muted">Shob line 0 — onto ekta line e poriman dile invoice kora jabe.</p>
          )}
          {needsPhoneForDue && (
            <p className="text-sm text-danger px-2">Baki rakhte hole phone number dite hobe.</p>
          )}
          {error && <p role="alert" className="text-sm text-danger px-2">{error}</p>}

          <button
            type="submit"
            disabled={busy || cart.length === 0 || !hasBillableLine || !customerName.trim() || !!totalsError || needsPhoneForDue}
            className="w-full rounded-full bg-brand hover:bg-brand-strong px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand/30 disabled:opacity-50 transition"
          >
            {busy ? "Wait..." : "Bikri Confirm Koro"}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Browser-verify the full retail flow**

Start the dev server, log in as admin, go to `/sell`.

- Confirm step 1 shows the same picker as `/wholesale` but at retail prices, with steppers defaulting to 0/1 the same way, and a working custom-item button.
- Add a medicine and a custom item, go to checkout.
- Type a phone number that has no prior sale — confirm no dropdown appears (or an empty one), name field stays required.
- Complete one sale with a name, no phone, discount left at 0, paid = full total. Confirm it succeeds, shows the "Invoice ... record kora hoyeche!" panel, and the print link opens a real invoice.
- Start a second sale, type that same phone number partially — confirm the autocomplete dropdown shows the name from the first sale, and clicking it fills both fields.
- Set a percent discount, confirm the amount box updates to match; then switch to typing in the amount box, confirm the percent box updates to match.
- Set Joma below the total with a phone entered — confirm the sale succeeds and shows a due.
- Try the same partial payment with the phone field cleared — confirm the submit button disables and the Banglish error shows, and that clearing it again after typing a phone re-enables submission.
- Visit `/retail-due`, confirm the customer from the due sale appears with the correct baki, open their ledger, record a partial Joma, confirm the balance updates.
- Visit `/reports` for today, confirm the retail summary card now shows a baki figure.

- [ ] **Step 4: Commit**

```bash
git add src/components/RetailSaleForm.tsx
git commit -m "$(cat <<'EOF'
feat: rebuild RetailSaleForm as a two-step form on SaleItemPicker

Mirrors the wholesale counter's picker/steppers/custom-items, replaces
the buyer dropdown with a phone-autocomplete + required-name pair, and
adds the dual percent/amount discount box, a Joma field, and the
invoice/print success panel.
EOF
)"
```

---

### Task 13: Backfill `RetailCustomer` from existing retail sale history

**Files:**
- Create: `scripts/backfill-retail-customers.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Backfills the `retailcustomers` collection from existing `retail` Sale
 * history, so the phone-number autocomplete and the Khuchra Baki due ledger
 * are not blind to customers who bought before RetailCustomer existed.
 *
 * For each distinct non-empty buyerPhone on a retail sale, upserts a
 * RetailCustomer with the name from that phone's most recent sale — the
 * same "one phone, one remembered name" rule the retail counter itself
 * uses.
 *
 * DEPLOY ORDER: should run before this branch's code goes live, but unlike
 * migrate-pricing-fields.ts the app does not fail without it — a customer
 * who hasn't bought again since this shipped simply won't appear in the
 * autocomplete or due ledger yet, not crash anything. Safe to re-run: every
 * run recomputes the same latest-name-per-phone result from Sale history
 * and upserts it.
 *
 * Usage: npx tsx scripts/backfill-retail-customers.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const sales = db.collection("sales");
  const retailCustomers = db.collection("retailcustomers");

  const rows = await sales
    .aggregate<{ _id: string; name: string }>([
      { $match: { type: "retail", buyerPhone: { $gt: "" } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$buyerPhone", name: { $first: "$buyerName" } } },
    ])
    .toArray();

  let count = 0;
  for (const row of rows) {
    await retailCustomers.updateOne(
      { phone: row._id },
      { $set: { phone: row._id, name: row.name } },
      { upsert: true },
    );
    count++;
  }
  console.log(`retailcustomers: upserted ${count} document(s) from retail sale history.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run against the in-memory pattern manually (no automated test — matches the existing migration scripts' convention, neither of which has one)**

Confirm the script at least type-checks and runs without a live database by inspection: `npx tsc --noEmit` covers type errors; do not attempt to run it against the real Atlas database as part of this task — that is the owner's deploy step, not a development-time action.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-retail-customers.ts
git commit -m "$(cat <<'EOF'
chore: add RetailCustomer backfill script from retail sale history

DEPLOY ORDER note in the script header — should run before this
branch's code goes live so the phone autocomplete and Khuchra Baki
ledger aren't blind to pre-existing retail customers.
EOF
)"
```

---

## Final Verification

- [ ] Run the full suite: `npx vitest run`. Expected: the only remaining failures are the 6 pre-existing, out-of-scope ones listed in Global Constraints (`adminOrders.test.ts`, `authorization.test.ts` one case, `buyerOrders.test.ts`, `medicines.test.ts`, `stockStatus.test.ts`, `Order.test.ts`) — every test in a file this plan touched or added must be green.
- [ ] Run `npx tsc --noEmit` once more at the end for a clean full-project type-check.
- [ ] Re-walk the browser checklist from Task 12, Step 3, once more end-to-end after all tasks are merged together (not just after Task 12 in isolation), since Tasks 7-10 land after it in dependency order for some execution strategies but should all be present by the end.
