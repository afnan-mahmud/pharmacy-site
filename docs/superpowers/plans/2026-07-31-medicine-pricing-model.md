# Medicine Pricing Model Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Medicine's two overloaded price fields (`boxPricePaisa`, `pataPricePaisa`) with five explicit fields — a purchasing cost plus separate wholesale (box + pata) and khuchra/retail (box + pata) rates — and fix every sale/order path (retail counter, wholesale counter, buyer order + admin approval) to price from the correct explicit rate instead of proration or a missing rate.

**Architecture:** Money stays integer paisa throughout (`docs/superpowers/specs/2026-07-31-medicine-pricing-model-design.md`). `wholesaleLineTotal`'s box-rate proration is deleted everywhere it appears (wholesale sale, buyer browse cart) and replaced by a plain `boxes * boxRate + patas * pataRate` split, now that a real pata rate exists for both channels. The buyer order flow (`Order` model, `submitOrder`, `approveOrder`) already carries `boxes` and `patas` per line — it just never snapshotted or billed a pata rate; this plan adds that snapshot and wires the admin approval screens (`OrderEditor`, `PendingOrders`) to actually use it instead of silently dropping patas.

**Tech Stack:** Next.js App Router, TypeScript, Mongoose/MongoDB (transactions), Vitest + mongodb-memory-server.

## Global Constraints

- Money is integer paisa, never floats. Stock is integer patas, never boxes.
- Every stock change goes through `applyStockDelta` (`src/lib/stockTransaction.ts`) — never a bare `$inc`. This plan does not touch stock mechanics, only pricing.
- Every server action calls its guard first (`requireAdminAction`/`requireBuyerAction`).
- All user-facing strings are Banglish (Bengali in Latin letters), never Bengali script. ৳ is fine.
- No component tests exist in this codebase (`tests/**/*.test.ts` only) — UI-only tasks are verified by running the existing suite plus a manual browser check, not new `.test.tsx` files.
- Follow the existing code's documentation style: a comment only where the *why* is non-obvious, never restating the *what*.
- **Known pre-existing test failures, out of scope:** at the start of this plan, `npx vitest run` already has 35 failing tests across 8 files (confirmed by running it before any change in this plan). Most are in files this plan rewrites anyway (`sales.test.ts`, `buyerOrders.test.ts`, `medicines.test.ts`, `saleTotals.test.ts`, `Order.test.ts`) and get fixed incidentally. Three are explicitly **not** this plan's job and must be left alone: `tests/lib/stockStatus.test.ts` (a real `stockStatus()` bug — 0 stock reports "low" instead of "out"), `tests/actions/authorization.test.ts` (one failure, `registerBuyer`), and `tests/actions/adminOrders.test.ts > approveOrder > refuses an item not in the order`. Do not fix these as part of this plan; if a task's "run the full suite" step shows only these (plus any it already expected), that is a pass, not a regression.

---

## Task 1: `Medicine` schema — five pricing fields replace two

**Files:**
- Modify: `src/models/Medicine.ts:22-28`

**Interfaces:**
- Produces: `MedicineDoc` now has `purchasePricePaisa`, `wholesaleBoxPricePaisa`, `wholesalePataPricePaisa`, `retailBoxPricePaisa`, `retailPataPricePaisa`, `mrpBoxPricePaisa` (unchanged name) — `boxPricePaisa`/`pataPricePaisa` no longer exist anywhere on the schema.

This is a pure schema edit with no server-side logic of its own — its correctness is exercised by Task 2's tests (`createMedicine`/`updateMedicine`, which is the only way the schema's `required`/`min` constraints are reachable through this codebase's own code paths). No standalone test file for the schema alone.

- [ ] **Step 1: Implement**

In `src/models/Medicine.ts`, replace lines 22-28:

```ts
patasPerBox: { type: Number, required: true, min: 1 },
// Purchasing/cost rate, per box. Never shown to a buyer or a retail
// customer — this is the pharmacy's own cost basis, kept only so margin
// can eventually be computed. 0 means "not entered yet".
purchasePricePaisa: { type: Number, required: true, default: 0, min: 0 },
// Wholesale channel: what a wholesale buyer (the buyer portal, the
// WholesaleSaleForm) pays. Two independent rates — a box rate and a
// per-pata rate for loose quantities — not one rate prorated into the
// other. See src/lib/writeWholesaleSale.ts.
wholesaleBoxPricePaisa: { type: Number, required: true, min: 0 },
wholesalePataPricePaisa: { type: Number, required: true, min: 0 },
// Khuchra (retail) channel: what a walk-in counter customer pays. Same
// two-rate shape as wholesale, independent of it. See recordRetailSale
// in src/actions/sales.ts.
retailBoxPricePaisa: { type: Number, required: true, min: 0 },
retailPataPricePaisa: { type: Number, required: true, min: 0 },
// Optional list price (MRP) per box, for the struck-through "was" price
// and a discount badge. 0 means no MRP — nothing struck through. When
// set, it is kept at or above wholesaleBoxPricePaisa (a discount, not a
// markup) — see the validation in src/actions/medicines.ts.
mrpBoxPricePaisa: { type: Number, required: true, default: 0, min: 0 },
```

- [ ] **Step 2: Commit**

```bash
git add src/models/Medicine.ts
git commit -m "feat: replace Medicine's two price fields with five explicit rates"
```

---

## Task 2: `medicines.ts` action — validation and `toFields()` for five rates

**Files:**
- Modify: `src/actions/medicines.ts:16-30` (`MedicineInput`)
- Modify: `src/actions/medicines.ts:69-103` (`validate`)
- Modify: `src/actions/medicines.ts:105-119` (`toFields`)
- Test: `tests/actions/medicines.test.ts`

**Interfaces:**
- Consumes: `Medicine` schema from Task 1
- Produces: `MedicineInput` type with `purchasePricePaisa?`, `wholesaleBoxPricePaisa`, `wholesalePataPricePaisa`, `retailBoxPricePaisa`, `retailPataPricePaisa`, `mrpBoxPricePaisa?` — no `boxPricePaisa`/`pataPricePaisa`.

- [ ] **Step 1: Write the failing tests**

In `tests/actions/medicines.test.ts`, replace the `napa` fixture (lines 33-41):

```ts
const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  purchasePricePaisa: 9000,
  wholesaleBoxPricePaisa: 12000,
  wholesalePataPricePaisa: 1300,
  retailBoxPricePaisa: 13000,
  retailPataPricePaisa: 1400,
  lowStockThreshold: 20,
};
```

Replace the "stores both the box rate and the pata rate" test (lines 51-55) with:

```ts
it("stores all four channel rates and the purchase rate", async () => {
  const medicine = await unwrap(createMedicine(napa));
  expect(medicine.purchasePricePaisa).toBe(9000);
  expect(medicine.wholesaleBoxPricePaisa).toBe(12000);
  expect(medicine.wholesalePataPricePaisa).toBe(1300);
  expect(medicine.retailBoxPricePaisa).toBe(13000);
  expect(medicine.retailPataPricePaisa).toBe(1400);
});

it("defaults purchasePricePaisa to 0 when omitted", async () => {
  const { purchasePricePaisa, ...rest } = napa;
  const medicine = await unwrap(createMedicine(rest as unknown as typeof napa));
  expect(medicine.purchasePricePaisa).toBe(0);
});
```

Replace "rejects negative prices" (lines 81-85) and "rejects a non-integer price" (lines 87-91) and "rejects a NaN price" (lines 93-97) and "rejects an Infinity price" (lines 99-103) with parametrised versions covering all four required rate fields:

```ts
it.each([
  "wholesaleBoxPricePaisa",
  "wholesalePataPricePaisa",
  "retailBoxPricePaisa",
  "retailPataPricePaisa",
] as const)("rejects a negative %s", async (field) => {
  await expect(
    unwrap(createMedicine({ ...napa, [field]: -1 })),
  ).rejects.toThrow("cannot be negative");
});

it.each([
  "wholesaleBoxPricePaisa",
  "wholesalePataPricePaisa",
  "retailBoxPricePaisa",
  "retailPataPricePaisa",
] as const)("rejects a non-integer %s", async (field) => {
  await expect(
    unwrap(createMedicine({ ...napa, [field]: 100.5 })),
  ).rejects.toThrow("whole number");
});

it.each([
  "wholesaleBoxPricePaisa",
  "wholesalePataPricePaisa",
  "retailBoxPricePaisa",
  "retailPataPricePaisa",
] as const)("rejects a NaN %s", async (field) => {
  await expect(
    unwrap(createMedicine({ ...napa, [field]: NaN })),
  ).rejects.toThrow("whole number");
});

it("rejects a negative purchasePricePaisa when provided", async () => {
  await expect(
    unwrap(createMedicine({ ...napa, purchasePricePaisa: -1 })),
  ).rejects.toThrow("cannot be negative");
});
```

Replace "updates prices" in the `updateMedicine` block (lines 227-234):

```ts
it("updates prices", async () => {
  const medicine = await unwrap(createMedicine(napa));
  const updated = await unwrap(updateMedicine(String(medicine._id), {
    ...napa,
    wholesaleBoxPricePaisa: 13000,
  }));
  expect(updated.wholesaleBoxPricePaisa).toBe(13000);
});
```

Update "rejects invalid input, same as createMedicine" (lines 257-262):

```ts
it("rejects invalid input, same as createMedicine", async () => {
  const medicine = await unwrap(createMedicine(napa));
  await expect(
    unwrap(updateMedicine(String(medicine._id), { ...napa, wholesaleBoxPricePaisa: -1 })),
  ).rejects.toThrow("cannot be negative");
});
```

Add MRP-vs-wholesale-box tests near the end of the `createMedicine` describe block:

```ts
it("accepts an MRP at or above the wholesale box rate", async () => {
  const medicine = await unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 12000 }));
  expect(medicine.mrpBoxPricePaisa).toBe(12000);
});

it("rejects an MRP below the wholesale box rate", async () => {
  await expect(
    unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 11000 })),
  ).rejects.toThrow("MRP pack rate er cheye kom hote parbe na");
});

it("allows 0 as the no-MRP sentinel regardless of the wholesale box rate", async () => {
  const medicine = await unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 0 }));
  expect(medicine.mrpBoxPricePaisa).toBe(0);
});
```

Every other test in the file that references `boxPricePaisa`/`pataPricePaisa` on the `napa` fixture implicitly (e.g. "creates a medicine with zero stock", "rejects an empty name") needs no further change — they use `napa` as a whole and do not assert on the old field names directly.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/medicines.test.ts`
Expected: FAIL — `createMedicine`/`updateMedicine` still validate/store `boxPricePaisa`/`pataPricePaisa`, so `napa`'s new field names are silently ignored by `toFields()` and the schema rejects the payload for missing required `boxPricePaisa`/`pataPricePaisa` (or, if Task 1 already ran, the schema itself already expects the new names but `validate`/`toFields` here still reference the old ones — either way, this fails against the unmodified action file).

- [ ] **Step 3: Implement**

In `src/actions/medicines.ts`, replace `MedicineInput` (lines 16-30):

```ts
export type MedicineInput = {
  name: string;
  genericName: string;
  company: string;
  // Which unit words this medicine is shown with. Omitted means "tablet",
  // which is what every medicine created before this field existed is.
  form?: MedicineForm;
  patasPerBox: number;
  // Optional; omitted or 0 means "not entered yet" — no historical cost
  // data exists for medicines created before this field existed.
  purchasePricePaisa?: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  // Optional list price (MRP) per box for the struck-through display; omitted
  // or 0 means no MRP. When present it must sit at or above
  // wholesaleBoxPricePaisa.
  mrpBoxPricePaisa?: number;
  lowStockThreshold: number;
};
```

Replace the four price-validation lines inside `validate()` (lines 91-102):

```ts
validateNonNegativeInteger(input.wholesaleBoxPricePaisa, "wholesaleBoxPricePaisa");
validateNonNegativeInteger(input.wholesalePataPricePaisa, "wholesalePataPricePaisa");
validateNonNegativeInteger(input.retailBoxPricePaisa, "retailBoxPricePaisa");
validateNonNegativeInteger(input.retailPataPricePaisa, "retailPataPricePaisa");
const purchasePricePaisa = input.purchasePricePaisa ?? 0;
validateNonNegativeInteger(purchasePricePaisa, "purchasePricePaisa");
const mrp = input.mrpBoxPricePaisa ?? 0;
validateNonNegativeInteger(mrp, "mrpBoxPricePaisa");
validateNonNegativeInteger(input.lowStockThreshold, "lowStockThreshold");

// MRP is the struck-through "was" price, so it must sit above the selling
// wholesale box price — an MRP below it would show a negative discount. 0
// is the "no MRP" sentinel and is always allowed.
if (mrp > 0 && mrp < input.wholesaleBoxPricePaisa) {
  throw new Error("MRP pack rate er cheye kom hote parbe na");
}
```

Replace `toFields()` (lines 105-119):

```ts
function toFields(input: MedicineInput) {
  const name = input.name.trim();
  return {
    name,
    nameLower: name.toLowerCase(),
    genericName: toOptionalString(input.genericName, "genericName").trim(),
    company: toOptionalString(input.company, "company").trim(),
    form: toMedicineForm(input.form),
    patasPerBox: input.patasPerBox,
    purchasePricePaisa: input.purchasePricePaisa ?? 0,
    wholesaleBoxPricePaisa: input.wholesaleBoxPricePaisa,
    wholesalePataPricePaisa: input.wholesalePataPricePaisa,
    retailBoxPricePaisa: input.retailBoxPricePaisa,
    retailPataPricePaisa: input.retailPataPricePaisa,
    mrpBoxPricePaisa: input.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: input.lowStockThreshold,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/medicines.test.ts`
Expected: PASS for every test except ones already listed as pre-existing/out-of-scope failures (`listMedicines > excludes deactivated medicines`, `deactivateMedicine > ...` — these reference a `deactivateMedicine` export that does not exist in `src/actions/medicines.ts` today; leave them exactly as they already were, per the Global Constraints note).

- [ ] **Step 5: Commit**

```bash
git add src/actions/medicines.ts tests/actions/medicines.test.ts
git commit -m "feat: validate and store five explicit medicine pricing fields"
```

---

## Task 3: `MedicineForm.tsx` — grouped rate sections

**Files:**
- Modify: `src/components/MedicineForm.tsx:23-34` (`MedicineFormValues`)
- Modify: `src/components/MedicineForm.tsx:53-64` (price state)
- Modify: `src/components/MedicineForm.tsx:91-103` (submit payload)
- Modify: `src/components/MedicineForm.tsx:177-215` (price input JSX)

**Interfaces:**
- Consumes: `createMedicine`/`updateMedicine` from Task 2 (`MedicineInput` now has five rate fields)
- Produces: `MedicineFormValues` with `purchasePricePaisa`, `wholesaleBoxPricePaisa`, `wholesalePataPricePaisa`, `retailBoxPricePaisa`, `retailPataPricePaisa`, `mrpBoxPricePaisa` — consumed by `MedicineTable.tsx` (Task 4) as `MedicineRow extends MedicineFormValues`.

No `.test.tsx` coverage in this codebase's convention (Global Constraints) — verified by typecheck, the full suite, and a manual browser pass.

- [ ] **Step 1: Implement**

Replace `MedicineFormValues` (lines 23-34):

```ts
export type MedicineFormValues = {
  id?: string;
  name: string;
  genericName: string;
  company: string;
  form: DosageForm;
  patasPerBox: number;
  purchasePricePaisa: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  mrpBoxPricePaisa: number;
  lowStockThreshold: number;
};
```

Replace the price-state block (lines 53-64) with one taka-string state per rate:

```ts
const [purchasePrice, setPurchasePrice] = useState(
  initial?.purchasePricePaisa ? String(paisaToTaka(initial.purchasePricePaisa)) : "",
);
const [wholesaleBoxPrice, setWholesaleBoxPrice] = useState(
  initial ? String(paisaToTaka(initial.wholesaleBoxPricePaisa)) : "",
);
const [wholesalePataPrice, setWholesalePataPrice] = useState(
  initial ? String(paisaToTaka(initial.wholesalePataPricePaisa)) : "",
);
const [retailBoxPrice, setRetailBoxPrice] = useState(
  initial ? String(paisaToTaka(initial.retailBoxPricePaisa)) : "",
);
const [retailPataPrice, setRetailPataPrice] = useState(
  initial ? String(paisaToTaka(initial.retailPataPricePaisa)) : "",
);
const [mrp, setMrp] = useState(
  initial?.mrpBoxPricePaisa ? String(paisaToTaka(initial.mrpBoxPricePaisa)) : "",
);
```

Replace the submit payload's price block (lines 91-103):

```ts
const wholesalePataPricePaisa = takaToPaisa(wholesalePataPrice || 0);
const retailPataPricePaisa = takaToPaisa(retailPataPrice || 0);
const medicineInput = {
  name,
  genericName,
  company,
  form,
  patasPerBox: isOther ? 1 : Number(patasPerBox),
  purchasePricePaisa: takaToPaisa(purchasePrice || 0),
  // "other" has no outer pack, so each channel's box rate collapses to
  // its own pata rate (1 box === 1 piece) — same rule the pack-size field
  // above already follows.
  wholesaleBoxPricePaisa: isOther ? wholesalePataPricePaisa : takaToPaisa(wholesaleBoxPrice || 0),
  wholesalePataPricePaisa,
  retailBoxPricePaisa: isOther ? retailPataPricePaisa : takaToPaisa(retailBoxPrice || 0),
  retailPataPricePaisa,
  mrpBoxPricePaisa: takaToPaisa(mrp || 0),
  lowStockThreshold: Number(threshold),
};
```

Replace the price input JSX (lines 177-215) — the box-price/pata-price/MRP block — with four grouped sections. This replaces the two `{!isOther && (...)}` box-price blocks and the two always-shown MRP/pata-price blocks with: Purchase rate (always shown, one input), Wholesale rate (one or two inputs depending on `isOther`), Khuchra rate (one or two inputs), MRP (unchanged position/logic):

```tsx
<div className="space-y-1.5">
  <label htmlFor="purchasePrice" className={labelCls}>
    Purchase rate (৳) — per {isOther ? labels.inner : labels.outer}
  </label>
  <input id="purchasePrice" type="number" step="0.01" min={0} className={input}
    value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)}
    placeholder="Kena dam" />
</div>
<div className="space-y-1.5 sm:col-span-2">
  <p className={labelCls}>Wholesale rate</p>
  <div className="grid gap-3 sm:grid-cols-2">
    {!isOther && (
      <input id="wholesaleBoxPrice" type="number" step="0.01" min={0} className={input}
        value={wholesaleBoxPrice} onChange={(e) => setWholesaleBoxPrice(e.target.value)}
        placeholder={`${capitalize(labels.outer)} rate (৳)`} required />
    )}
    <input id="wholesalePataPrice" type="number" step="0.01" min={0} className={input}
      value={wholesalePataPrice} onChange={(e) => setWholesalePataPrice(e.target.value)}
      placeholder={`${capitalize(isOther ? labels.inner : labels.inner)} rate (৳)`} required />
  </div>
</div>
<div className="space-y-1.5 sm:col-span-2">
  <p className={labelCls}>Khuchra rate</p>
  <div className="grid gap-3 sm:grid-cols-2">
    {!isOther && (
      <input id="retailBoxPrice" type="number" step="0.01" min={0} className={input}
        value={retailBoxPrice} onChange={(e) => setRetailBoxPrice(e.target.value)}
        placeholder={`${capitalize(labels.outer)} rate (৳)`} required />
    )}
    <input id="retailPataPrice" type="number" step="0.01" min={0} className={input}
      value={retailPataPrice} onChange={(e) => setRetailPataPrice(e.target.value)}
      placeholder={`${capitalize(labels.inner)} rate (৳)`} required />
  </div>
</div>
<div className="space-y-1.5">
  <label htmlFor="mrp" className={labelCls}>
    MRP {labels.outer} rate (৳) — optional
  </label>
  <input id="mrp" type="number" step="0.01" min={0} className={input}
    value={mrp} onChange={(e) => setMrp(e.target.value)} placeholder="Kata dam dekhate hole" />
  <p className="text-xs text-muted">
    {capitalize(labels.outer)}{" "}
    wholesale rate er cheye beshi dile buyer &ldquo;kata dam&rdquo; ar discount
    dekhbe.
  </p>
</div>
```

(Field-level `<label>` elements are replaced by a group `<p>` label plus placeholder text on the inputs themselves, since each group now holds up to two inputs — this matches how the "1 {outer} e koto {inner}" grid already groups related fields on this form.)

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; test suite unaffected by this task (no `.test.ts` file imports `MedicineForm.tsx`).

- [ ] **Step 3: Manual browser verification**

Start the dev server (`npm run dev`), log in, go to Medicines → + Notun medicine:
- Confirm four rate groups appear: Purchase rate, Wholesale rate (box + pata), Khuchra rate (box + pata), MRP.
- Fill all rates for a tablet-form medicine, save, reopen it for edit — confirm every value round-trips correctly (taka in, same taka back out).
- Switch form to "Liquid"/other (no outer pack) — confirm Wholesale and Khuchra each collapse to a single input, and saving sets that channel's box rate equal to its pata rate (verify via the medicine table in Task 4, or by re-opening the edit form).
- Confirm the MRP hint text and the "MRP below wholesale rate" rejection (from Task 2) both work from the UI.

- [ ] **Step 4: Commit**

```bash
git add src/components/MedicineForm.tsx
git commit -m "feat: split the medicine form into purchase/wholesale/khuchra/MRP rate groups"
```

---

## Task 4: `MedicineTable.tsx` and `medicines/page.tsx` — renamed field display

**Files:**
- Modify: `src/components/MedicineTable.tsx:54-68` (`doSearch` mapping)
- Modify: `src/components/MedicineTable.tsx:255-312` (`DesktopRows`/`MobileCards` display)
- Modify: `src/app/(admin)/medicines/page.tsx:8-21` (row mapping)

**Interfaces:**
- Consumes: `MedicineFormValues` from Task 3 (`MedicineRow extends MedicineFormValues`, unchanged in this task)

- [ ] **Step 1: Implement**

In `src/components/MedicineTable.tsx`'s `doSearch` (lines 54-68), replace the mapped fields:

```ts
results.map((m) => ({
  id: m._id,
  name: m.name,
  genericName: m.genericName,
  company: m.company,
  form: toMedicineForm(m.form),
  patasPerBox: m.patasPerBox,
  purchasePricePaisa: m.purchasePricePaisa ?? 0,
  wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
  wholesalePataPricePaisa: m.wholesalePataPricePaisa,
  retailBoxPricePaisa: m.retailBoxPricePaisa,
  retailPataPricePaisa: m.retailPataPricePaisa,
  mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
  lowStockThreshold: m.lowStockThreshold,
  stockPatas: m.stockPatas,
  active: m.active,
})),
```

In `DesktopRows` (around lines 258-263), replace the "Pack rate"/"Khuchra rate" cells — this table shows the wholesale box rate and khuchra pata rate as its two summary columns (the same two "at a glance" numbers it showed before the rename, now correctly labelled):

```tsx
<td className={`${td} font-medium text-ink`}>
  {formatTaka(row.wholesaleBoxPricePaisa)}
</td>
<td className={`${td} font-medium text-ink`}>
  {formatTaka(row.retailPataPricePaisa)} / {unitLabelsFor(row.form).inner}
</td>
```

In `MobileCards` (around lines 303-312), same rename:

```tsx
<div className="mt-3 flex items-center justify-between rounded-lg bg-canvas p-2 text-xs">
  <div>
    <div className="text-muted">Wholesale Rate</div>
    <div className="font-semibold text-ink">{formatTaka(row.wholesaleBoxPricePaisa)}</div>
  </div>
  <div>
    <div className="text-muted">Khuchra Rate</div>
    <div className="font-semibold text-ink">{formatTaka(row.retailPataPricePaisa)}</div>
  </div>
</div>
```

In `src/app/(admin)/medicines/page.tsx`, replace the row mapping (lines 8-21):

```ts
const rows: MedicineRow[] = medicines.map((m) => ({
  id: m._id,
  name: m.name,
  genericName: m.genericName,
  company: m.company,
  form: toMedicineForm(m.form),
  patasPerBox: m.patasPerBox,
  purchasePricePaisa: m.purchasePricePaisa ?? 0,
  wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
  wholesalePataPricePaisa: m.wholesalePataPricePaisa,
  retailBoxPricePaisa: m.retailBoxPricePaisa,
  retailPataPricePaisa: m.retailPataPricePaisa,
  mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
  lowStockThreshold: m.lowStockThreshold,
  stockPatas: m.stockPatas,
  active: m.active,
}));
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean/unaffected by this task.

- [ ] **Step 3: Manual browser verification**

At `/medicines`, confirm the table (desktop and mobile) shows "Wholesale Rate" and "Khuchra Rate" columns with the correct values for a medicine created in Task 3. Confirm editing a row still opens `MedicineForm` pre-filled correctly (this exercises `MedicineRow`'s full field set flowing into `MedicineForm`'s `initial` prop).

- [ ] **Step 4: Commit**

```bash
git add src/components/MedicineTable.tsx "src/app/(admin)/medicines/page.tsx"
git commit -m "feat: show renamed wholesale/khuchra rates in the medicine list"
```

---

## Task 5: `saleTotals.ts` — drop `wholesaleLineTotal`

**Files:**
- Modify: `src/lib/saleTotals.ts:94-121` (remove `wholesaleLineTotal`)
- Test: `tests/lib/saleTotals.test.ts:165-196` (remove its tests)

**Interfaces:**
- Produces: `src/lib/saleTotals.ts` no longer exports `wholesaleLineTotal`. `lineTotal` and `computeTotals` are unchanged.

- [ ] **Step 1: Update the test file**

In `tests/lib/saleTotals.test.ts`, remove the `wholesaleLineTotal` import from line 2 (leaving `lineTotal, computeTotals`) and delete the entire `describe("wholesaleLineTotal", ...)` block (lines 165-196).

- [ ] **Step 2: Run the tests to verify they fail (missing export)**

Run: `npx vitest run tests/lib/saleTotals.test.ts`
Expected: PASS already, since the test file no longer references `wholesaleLineTotal` — this task's "failing" checkpoint is instead the *build*: run `npx tsc --noEmit` first and confirm it still reports errors in every file that still imports `wholesaleLineTotal` (`writeWholesaleSale.ts`, `WholesaleSaleForm.tsx`, `BuyerBrowse.tsx`) once Step 3 removes the export — those are fixed in Tasks 6, 8, 14 respectively, not here.

- [ ] **Step 3: Implement**

In `src/lib/saleTotals.ts`, delete the `wholesaleLineTotal` function and its doc comment (lines 94-121), leaving the file ending after `computeTotals`.

- [ ] **Step 4: Run the saleTotals test to verify it passes**

Run: `npx vitest run tests/lib/saleTotals.test.ts`
Expected: PASS. (The full suite is red at this point — Tasks 6, 8, 14 still import the now-removed export — the plan proceeds task by task rather than requiring a green full-suite run mid-way; see Task 7 for the first "no longer red" checkpoint.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/saleTotals.ts tests/lib/saleTotals.test.ts
git commit -m "refactor: remove wholesaleLineTotal, replaced by explicit box+pata rates"
```

---

## Task 6: `writeWholesaleSale.ts` — plain box+pata split, no proration

**Files:**
- Modify: `src/lib/writeWholesaleSale.ts:1-8` (imports), `:79-89` (line pricing)
- Test: `tests/lib/writeWholesaleSale.test.ts`

**Interfaces:**
- Consumes: `Medicine.wholesaleBoxPricePaisa`/`wholesalePataPricePaisa` from Task 1
- Produces: a wholesale sale line's `lineTotalPaisa` is now `quantity * wholesaleBoxRate + leftoverPatas * wholesalePataRate`, computed directly — no rounding step, no `wholesaleLineTotal` call.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/writeWholesaleSale.test.ts`, replace `makeMedicine`'s Mongo fields (lines 14-26):

```ts
async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
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
  return medicine;
}
```

Replace "prices a line with boxes and leftover patas together" (lines 124-136) — the old test asserted the proration formula; the new one asserts the plain split:

```ts
it("prices a line's boxes and leftover patas from their own separate rates", async () => {
  const medicine = await makeMedicine(); // wholesaleBoxPricePaisa 12000, wholesalePataPricePaisa 1300
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 2, patas: 3 }],
  });
  // 2 * 12000 + 3 * 1300 = 27900, not a prorated 23 * 12000 / 10.
  expect(sale!.totalPaisa).toBe(27900);
  expect(sale!.items[0].quantity).toBe(2);
  expect(sale!.items[0].leftoverPatas).toBe(3);
  expect(sale!.items[0].patasDeducted).toBe(23);
  expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(477);
});
```

Replace "treats a patas-only line (zero boxes) as billable" (lines 138-146):

```ts
it("treats a patas-only line (zero boxes) as billable at the pata rate", async () => {
  const medicine = await makeMedicine();
  const sale = await run({
    buyer: buyer(),
    items: [{ medicineId: String(medicine._id), boxes: 0, patas: 4 }],
  });
  expect(sale!.items[0].leftoverPatas).toBe(4);
  expect(sale!.totalPaisa).toBe(5200); // 4 * 1300
});
```

Update the other totalPaisa assertions in this file (lines 78, 100, 120, 155) to the new `wholesaleBoxPricePaisa` value — they were computed as `boxes * 12000`, which is unaffected by this change since `boxPricePaisa` and `wholesaleBoxPricePaisa` are both 12000 in the fixture, so **no numeric change needed** in those four; only the field name in `makeMedicine` (already done above) matters for them to keep passing.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts`
Expected: FAIL — `writeWholesaleSale` still reads `medicine.boxPricePaisa` (no longer a field on the schema after Task 1) and calls the now-deleted `wholesaleLineTotal`.

- [ ] **Step 3: Implement**

In `src/lib/writeWholesaleSale.ts`, update the import (line 4):

```ts
import { computeTotals } from "@/lib/saleTotals";
```

Replace the line-pricing block inside the `for` loop (lines 79-89):

```ts
lines.push({
  medicineId: medicine._id,
  medicineName: medicine.name,
  form: medicine.form,
  unit: "box" as const,
  quantity: item.boxes,
  leftoverPatas,
  ratePaisa: medicine.wholesaleBoxPricePaisa,
  lineTotalPaisa:
    item.boxes * medicine.wholesaleBoxPricePaisa +
    leftoverPatas * medicine.wholesalePataPricePaisa,
  patasDeducted: totalPatas,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/writeWholesaleSale.ts tests/lib/writeWholesaleSale.test.ts
git commit -m "feat: price a wholesale line's boxes and patas from their own rates"
```

---

## Task 7: `MedicinePicker.tsx` — renamed `PickedMedicine` fields

**Files:**
- Modify: `src/components/MedicinePicker.tsx:9-18` (`PickedMedicine`), `:46-55` (result mapping)

**Interfaces:**
- Produces: `PickedMedicine` now has `purchasePricePaisa`, `wholesaleBoxPricePaisa`, `wholesalePataPricePaisa`, `retailBoxPricePaisa`, `retailPataPricePaisa` — no `boxPricePaisa`/`pataPricePaisa`. Consumed by `RetailSaleForm.tsx` (Task 10) and `WholesaleSaleForm.tsx` (Task 8, which defines its own `PickedMedicine`-shaped custom-item objects too).

- [ ] **Step 1: Implement**

Replace `PickedMedicine` (lines 9-18):

```ts
export type PickedMedicine = {
  id: string;
  name: string;
  genericName: string;
  form: MedicineForm;
  patasPerBox: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  retailBoxPricePaisa: number;
  retailPataPricePaisa: number;
  stockPatas: number;
};
```

Replace the result mapping (lines 46-55):

```ts
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
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: still reports errors in `RetailSaleForm.tsx` and `WholesaleSaleForm.tsx` (both reference the old `PickedMedicine` field names) — those are fixed in Tasks 8 and 10. This step is a checkpoint, not a gate, for this task alone.

- [ ] **Step 3: Commit**

```bash
git add src/components/MedicinePicker.tsx
git commit -m "refactor: rename PickedMedicine's price fields to the four explicit rates"
```

---

## Task 8: `WholesaleSaleForm.tsx` — plain split, renamed fields

**Files:**
- Modify: `src/components/WholesaleSaleForm.tsx:10` (import), `:70-107` (custom item + search mapping), `:121-124` (`lineTotalFor`), `:367,531` (display)

**Interfaces:**
- Consumes: `PickedMedicine` from Task 7, `writeWholesaleSale`/`recordWholesaleSale` from Task 6 (already accepted `boxes`/`patas` — unchanged)

- [ ] **Step 1: Implement**

Drop the now-removed import (line 10):

```ts
import { computeTotals } from "@/lib/saleTotals";
```

In `addCustomItem` (lines 70-79), a custom item has no separate box/pata rate — it is priced flat, same as today (`writeWholesaleSale`'s custom-item branch, unchanged by Task 6, still reads `item.customPricePaisa` and prices `boxes * customPricePaisa` only). Update the constructed `PickedMedicine`-shaped object to the new field names, with all four rates set to the one entered price (patas are never sold on a custom line, so the pata rate is never read, but the type requires a value):

```ts
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
```

In the search-results mapping (lines 97-108):

```ts
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
  }))
);
```

Replace `lineTotalFor` (lines 121-124) with the plain split — no more proration, no `wholesaleLineTotal`:

```ts
function lineTotalFor(line: CartLine): number {
  return (
    line.boxes * line.medicine.wholesaleBoxPricePaisa +
    line.patas * line.medicine.wholesalePataPricePaisa
  );
}
```

Update the two remaining `boxPricePaisa` display references (line 230's `addCustomItem`'s `customPricePaisa: l.medicine.boxPricePaisa` inside `handleSubmit`, line 367's "Rate:" label, line 531's "Pack rate" table cell) to `wholesaleBoxPricePaisa`:

```ts
// handleSubmit, custom-item payload mapping (was l.medicine.boxPricePaisa)
customPricePaisa: l.medicine.wholesaleBoxPricePaisa,
```

```tsx
{/* Step-1 product row "Rate:" label */}
<span className="text-ink">Rate: {formatTaka(m.wholesaleBoxPricePaisa)}</span>
```

```tsx
{/* Step-2 cart table "Pack rate" cell */}
<td className={tdCls}>{formatTaka(line.medicine.wholesaleBoxPricePaisa)}</td>
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean (`RetailSaleForm.tsx` is fixed in Task 10 — if it still errors at this point, that is expected and resolved there, not here). Full suite: `tests/lib/writeWholesaleSale.test.ts`, `tests/lib/saleTotals.test.ts`, `tests/actions/sales.test.ts`'s wholesale-related tests pass (Tasks 5-6 already made them pass); this task touches no test file itself.

- [ ] **Step 3: Manual browser verification**

At Wholesale Bikri: add a medicine with distinct wholesale box/pata rates (e.g. box ৳500, pata ৳55), set 2 boxes + 3 patas — confirm the row total is `2*50000 + 3*5500 = 116500` paisa (৳1165.00), not a prorated figure. Add a custom item, confirm it still prices flat at `boxes * enteredPrice`. Submit a sale and confirm the invoice total matches.

- [ ] **Step 4: Commit**

```bash
git add src/components/WholesaleSaleForm.tsx
git commit -m "feat: price the wholesale cart from explicit box and pata rates"
```

---

## Task 9: `recordRetailSale` — box selling with two khuchra rates

**Files:**
- Modify: `src/actions/sales.ts:16-73` (`RetailSaleInput`, `validateRetail`)
- Modify: `src/actions/sales.ts:75-167` (`recordRetailSale`)
- Test: `tests/actions/sales.test.ts` (`recordRetailSale` describe block and every other block whose fixtures reference `boxPricePaisa`/`pataPricePaisa`)

**Interfaces:**
- Consumes: `Medicine.retailBoxPricePaisa`/`retailPataPricePaisa` from Task 1
- Produces: `RetailSaleInput.items: { medicineId: string; boxes: number; patas: number }[]` (was `{ medicineId, patas }[]`)

- [ ] **Step 1: Write the failing tests**

In `tests/actions/sales.test.ts`, replace the `napa` fixture (lines 30-38) and `makeMedicine` stays the same shape but now needs the five renamed/added fields — replace both:

```ts
const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  purchasePricePaisa: 9000,
  wholesaleBoxPricePaisa: 12000,
  wholesalePataPricePaisa: 1300,
  retailBoxPricePaisa: 13000,
  retailPataPricePaisa: 1400,
  lowStockThreshold: 20,
};
```

Every `recordRetailSale({ items: [{ medicineId: ..., patas: N }], ... })` call in the file's `recordRetailSale`, `cancelSale`, `sale lines snapshot the medicine form`, `retail customer details`, and `lookupRetailCustomer` describe blocks must add `boxes: 0` alongside its existing `patas`. Rather than list every one individually (there are ~25 call sites), apply this mechanical change throughout the file: every object literal of the form `{ medicineId: X, patas: N }` used as a `recordRetailSale` item becomes `{ medicineId: X, boxes: 0, patas: N }`.

Replace "charges the pata rate and deducts patas" (lines 66-77) with two tests — one for patas-only (the old behaviour, renamed rate), one new for boxes-only and mixed:

```ts
it("charges the khuchra pata rate and deducts patas", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 0, patas: 2 }],
    customerName: "Walk-in",
  }));

  expect(sale.type).toBe("retail");
  expect(sale.totalPaisa).toBe(2800); // 2 * 1400
  const after = await MedicineModel.findById(medicine._id);
  expect(after!.stockPatas).toBe(498);
});

it("charges the khuchra box rate and deducts a full box worth of patas", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
    customerName: "Walk-in",
  }));

  expect(sale.totalPaisa).toBe(26000); // 2 * 13000
  const after = await MedicineModel.findById(medicine._id);
  expect(after!.stockPatas).toBe(480); // 500 - 2*10
});

it("charges a mixed box+pata line from both khuchra rates, no proration", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 1, patas: 3 }],
    customerName: "Walk-in",
  }));

  expect(sale.totalPaisa).toBe(13000 + 3 * 1400); // 17200
  const after = await MedicineModel.findById(medicine._id);
  expect(after!.stockPatas).toBe(486); // 500 - (10 + 3)
});
```

Replace "snapshots the medicine name and rate onto the line" (lines 122-132) — a retail line's `unit`/`ratePaisa` need a defined meaning again now that a line can be box, pata, or both. Keep `unit` as `"pata"` for a pata-only line (unchanged historical meaning) and use `"box"` when any boxes are present, mirroring the wholesale line's convention:

```ts
it("snapshots the medicine name and khuchra pata rate onto a pata-only line", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 0, patas: 2 }],
    customerName: "Walk-in",
  }));
  expect(sale.items[0].medicineName).toBe("Napa 500mg");
  expect(sale.items[0].ratePaisa).toBe(1400);
  expect(sale.items[0].unit).toBe("pata");
  expect(sale.items[0].patasDeducted).toBe(2);
});

it("snapshots the khuchra box rate and marks the unit box when any boxes are sold", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 1, patas: 2 }],
    customerName: "Walk-in",
  }));
  expect(sale.items[0].unit).toBe("box");
  expect(sale.items[0].ratePaisa).toBe(13000);
  expect(sale.items[0].leftoverPatas).toBe(2);
  expect(sale.items[0].patasDeducted).toBe(12);
});
```

Replace "does not rewrite a past sale when the price later changes" (lines 134-147):

```ts
it("does not rewrite a past sale when the price later changes", async () => {
  const medicine = await makeMedicine();
  const sale = await unwrap(recordRetailSale({
    items: [{ medicineId: medicine._id, boxes: 0, patas: 2 }],
    customerName: "Walk-in",
  }));
  await MedicineModel.updateOne(
    { _id: medicine._id },
    { $set: { retailPataPricePaisa: 9900 } },
  );
  const stored = await SaleModel.findById(sale._id);
  expect(stored!.items[0].ratePaisa).toBe(1400);
  expect(stored!.totalPaisa).toBe(2800);
});
```

Replace "handles multiple lines" (lines 149-161):

```ts
it("handles multiple lines", async () => {
  const a = await makeMedicine();
  const b = await makeMedicine({ name: "Ace", retailPataPricePaisa: 1000 });
  const sale = await unwrap(recordRetailSale({
    items: [
      { medicineId: a._id, boxes: 0, patas: 2 },
      { medicineId: b._id, boxes: 0, patas: 3 },
    ],
    customerName: "Walk-in",
  }));
  expect(sale.totalPaisa).toBe(2800 + 3000);
  expect(sale.items).toHaveLength(2);
});
```

Replace the zero-quantity guard tests to require *both* to be zero, not just `patas`. "rejects a zero quantity" (lines 195-200) and "still rejects a zero quantity at the retail counter" (lines 856-862) become:

```ts
it("rejects a line with both boxes and patas at zero", async () => {
  const medicine = await makeMedicine();
  await expect(
    unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 0, patas: 0 }],
      customerName: "Walk-in",
    })),
  ).rejects.toThrow("Poriman 0 er kom hote parbe na");
});
```

(This replaces both duplicate tests with one — `sales.test.ts` currently has this same assertion twice, once in `recordRetailSale` and once in `zero-quantity wholesale lines`; keep it once, in the `recordRetailSale` describe block, and delete the duplicate from `zero-quantity wholesale lines`.)

Replace "rejects a fractional quantity" (lines 202-207):

```ts
it("rejects a fractional patas quantity", async () => {
  const medicine = await makeMedicine();
  await expect(
    unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 0, patas: 1.5 }],
      customerName: "Walk-in",
    })),
  ).rejects.toThrow("Poriman 0 er kom hote parbe na");
});

it("rejects a fractional boxes quantity", async () => {
  const medicine = await makeMedicine();
  await expect(
    unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1.5, patas: 0 }],
      customerName: "Walk-in",
    })),
  ).rejects.toThrow("Poriman 0 er kom hote parbe na");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/sales.test.ts`
Expected: FAIL — `RetailSaleInput` doesn't accept `boxes` yet, `validateRetail` doesn't validate it, and `recordRetailSale` prices from the old `pataPricePaisa` field, which no longer exists on the schema.

- [ ] **Step 3: Implement**

In `src/actions/sales.ts`, replace `RetailSaleInput` (line 17):

```ts
export type RetailSaleInput = {
  items: { medicineId: string; boxes: number; patas: number }[];
  /** Required. A counter sale must say who it was to. */
  customerName: string;
  /** Optional — the customer may decline to give one. */
  customerPhone?: string;
};
```

Replace the per-item validation inside `validateRetail` (lines 55-71):

```ts
const seen = new Set<string>();
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
  if (item.boxes === 0 && item.patas === 0) {
    throw new Error("Poriman 0 er kom hote parbe na");
  }
  // Two lines for one medicine would each pass their own stock check and
  // could together oversell it.
  if (seen.has(item.medicineId)) {
    throw new Error("Ekta medicine ekbar er beshi cart e dewa jabe na");
  }
  seen.add(item.medicineId);
}
```

Replace the per-item pricing/stock block inside `recordRetailSale`'s transaction (lines 90-120):

```ts
for (const item of input.items) {
  const medicine = await MedicineModel.findById(
    item.medicineId,
  ).session(session);
  if (!medicine) throw new Error("Medicine pawa jay ni");

  const totalPatas = boxesToPatas(item.boxes, medicine.patasPerBox) + item.patas;
  if (totalPatas > 0) {
    const ok = await applyStockDelta(medicine._id, -totalPatas, session);
    if (!ok) throw new Error("Medicine pawa jay ni");
  }

  const lineTotalPaisa =
    item.boxes * medicine.retailBoxPricePaisa +
    item.patas * medicine.retailPataPricePaisa;

  lines.push({
    medicineId: medicine._id,
    medicineName: medicine.name,
    form: medicine.form,
    // A retail line that includes any boxes is priced (and printed) like a
    // wholesale box line; a pure-patas line keeps its historical "pata"
    // unit — same convention writeWholesaleSale already uses.
    unit: item.boxes > 0 ? ("box" as const) : ("pata" as const),
    quantity: item.boxes > 0 ? item.boxes : item.patas,
    leftoverPatas: item.boxes > 0 ? item.patas : 0,
    ratePaisa: item.boxes > 0 ? medicine.retailBoxPricePaisa : medicine.retailPataPricePaisa,
    lineTotalPaisa,
    patasDeducted: totalPatas,
  });
}
```

This requires importing `boxesToPatas` (add to the top of `src/actions/sales.ts`, alongside the existing `applyStockDelta` import):

```ts
import { boxesToPatas } from "@/lib/units";
```

The subtotal computation right after this loop (lines 122-130) stays structurally the same, but since a mixed box+pata line's `lineTotalPaisa` is no longer `ratePaisa * quantity` (same situation `writeWholesaleSale` already handles), reuse that file's trick — price each line via its own already-computed total:

```ts
const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPaisa, 0);
const { subtotalPaisa, totalPaisa, duePaisa } = computeTotals(
  lines.map((l) => ({ ratePaisa: l.lineTotalPaisa, quantity: 1 })),
  0,
  subtotal,
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/sales.test.ts`
Expected: PASS for every retail/wholesale/cancel test (some pre-existing, out-of-scope wholesale failures noted in Global Constraints may remain — verify against that list, not a blanket "all green").

- [ ] **Step 5: Commit**

```bash
git add src/actions/sales.ts tests/actions/sales.test.ts
git commit -m "feat: let a retail sale line carry boxes and patas, priced from khuchra rates"
```

---

## Task 10: `RetailSaleForm.tsx` — box quantity input

**Files:**
- Modify: `src/components/RetailSaleForm.tsx:11-14` (`CartLine`), `:28-31` (total), `:63-76` (`addMedicine`/`updatePatas`), `:96-100` (submit payload), `:199-219` (cart table)

**Interfaces:**
- Consumes: `PickedMedicine` from Task 7, `recordRetailSale` from Task 9

- [ ] **Step 1: Implement**

Replace `CartLine` (lines 11-14):

```ts
type CartLine = {
  medicine: PickedMedicine;
  boxes: number;
  patas: number;
};
```

Replace the total calculation (lines 28-31):

```ts
const totalPaisa = cart.reduce(
  (sum, line) =>
    sum +
    line.boxes * line.medicine.retailBoxPricePaisa +
    line.patas * line.medicine.retailPataPricePaisa,
  0,
);
```

Replace `addMedicine` (lines 63-68) and add a `updateBoxes` handler alongside the existing `updatePatas` (lines 71-76):

```ts
function addMedicine(medicine: PickedMedicine) {
  // Don't allow a duplicate line — see the "one medicine once" rule.
  if (cart.some((l) => l.medicine.id === medicine.id)) return;
  setDone(null);
  setCart((prev) => [...prev, { medicine, boxes: 0, patas: 1 }]);
}

function updateBoxes(idx: number, raw: string) {
  const boxes = parseQuantityInput(raw, 0);
  setCart((prev) =>
    prev.map((line, i) => (i === idx ? { ...line, boxes } : line)),
  );
}

// Allowed to be 0: if a product is out of stock but requested, it can be zeroed.
function updatePatas(idx: number, raw: string) {
  const patas = parseQuantityInput(raw, 0);
  setCart((prev) =>
    prev.map((line, i) => (i === idx ? { ...line, patas } : line)),
  );
}
```

Replace the submit payload (lines 96-100):

```ts
const result = await recordRetailSale({
  items: cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes, patas: l.patas })),
  customerName,
  customerPhone,
});
```

Replace the cart table's Rate/Poriman/Mot cells (lines 199-219) to show both rates and both quantity inputs, mirroring `WholesaleSaleForm.tsx`'s Box/Pata stepper pair:

```tsx
<td className={tdCls}>
  <div className="text-xs">
    <div>{formatTaka(line.medicine.retailBoxPricePaisa)}/{unitLabelsFor(line.medicine.form).outer}</div>
    <div>{formatTaka(line.medicine.retailPataPricePaisa)}/{unitLabelsFor(line.medicine.form).inner}</div>
  </div>
</td>
<td className={tdCls}>
  <div className="flex items-center gap-1.5">
    <input
      type="number"
      min={0}
      value={line.boxes}
      onChange={(e) => updateBoxes(idx, e.target.value)}
      className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
    />
    <span className="text-xs font-medium text-muted">{unitLabelsFor(line.medicine.form).outer}</span>
    <input
      type="number"
      min={0}
      value={line.patas}
      onChange={(e) => updatePatas(idx, e.target.value)}
      className="w-16 rounded-xl border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition"
    />
    <span className="text-xs font-medium text-muted">
      {unitLabelsFor(line.medicine.form).inner} (stock: {line.medicine.stockPatas})
    </span>
  </div>
</td>
<td className={`${tdCls} text-right font-bold text-ink`}>
  {formatTaka(
    line.boxes * line.medicine.retailBoxPricePaisa +
      line.patas * line.medicine.retailPataPricePaisa,
  )}
</td>
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; test suite matches Task 9's result (this task adds no test file).

- [ ] **Step 3: Manual browser verification**

At Khuchra Bikri: add a medicine, set 1 box + 2 patas — confirm the row total is `retailBoxRate + 2*retailPataRate` and the cart submits successfully with both quantities. Add a second, pata-only line (0 boxes) — confirm it still works exactly as before. Try 0 boxes and 0 patas — confirm the sale is rejected client-side or server-side (Task 9's guard).

- [ ] **Step 4: Commit**

```bash
git add src/components/RetailSaleForm.tsx
git commit -m "feat: sell retail in boxes plus patas, priced from khuchra rates"
```

---

## Task 11: `Order` model — snapshot both wholesale rates

**Files:**
- Modify: `src/models/Order.ts:11-20` (`orderLineSchema`)
- Test: `tests/models/Order.test.ts`

**Interfaces:**
- Produces: `OrderLineDoc.wholesaleBoxPricePaisa` (renamed from `boxPricePaisa`) and `OrderLineDoc.wholesalePataPricePaisa` (new).

- [ ] **Step 1: Write the failing test**

In `tests/models/Order.test.ts`, replace `baseOrder`'s item (lines 16-22):

```ts
items: [
  {
    medicineId: MEDICINE_ID,
    medicineName: "Napa 500mg",
    boxes: 3,
    patas: 0,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
  },
],
```

Replace "snapshots the line's medicine name and price" (lines 37-42):

```ts
it("snapshots the line's medicine name and both wholesale rates", async () => {
  const order = await OrderModel.create(baseOrder());
  expect(order.items[0].medicineName).toBe("Napa 500mg");
  expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
  expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
  expect(order.items[0].boxes).toBe(3);
});
```

Replace the item literal inside "rejects a box count below 1" (lines 48-57) with the renamed field (leave the test's assertion/behaviour as-is — it is one of the pre-existing, out-of-scope failures per Global Constraints, since the schema's `boxes` field is `min: 0` not `min: 1` and this plan does not change that):

```ts
it("rejects a box count below 1", async () => {
  await expect(
    OrderModel.create(
      baseOrder({
        items: [
          {
            medicineId: MEDICINE_ID,
            medicineName: "Napa",
            boxes: 0,
            wholesaleBoxPricePaisa: 12000,
            wholesalePataPricePaisa: 1300,
          },
        ],
      }),
    ),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/models/Order.test.ts`
Expected: FAIL — `wholesalePataPricePaisa` is not yet a schema field, and `boxPricePaisa` is still required (missing from the new fixture), so document creation throws a validation error the test does not expect.

- [ ] **Step 3: Implement**

In `src/models/Order.ts`, replace `orderLineSchema`'s price field (lines 14-17):

```ts
// Snapshotted at order time: a price change before approval must never
// silently rewrite what the buyer thought he was ordering.
wholesaleBoxPricePaisa: { type: Number, required: true, min: 0 },
wholesalePataPricePaisa: { type: Number, required: true, min: 0 },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/models/Order.test.ts`
Expected: PASS, except "rejects a box count below 1" which stays failing per the Global Constraints note (pre-existing, unrelated to this plan) — confirm it fails for the *same reason* as before this task (schema allows `boxes: 0`), not a new reason.

- [ ] **Step 5: Commit**

```bash
git add src/models/Order.ts tests/models/Order.test.ts
git commit -m "feat: snapshot both wholesale rates on an order line"
```

---

## Task 12: `buyerOrders.ts` — buyer sees and orders against both wholesale rates

**Files:**
- Modify: `src/actions/buyerOrders.ts:32-46` (`BuyerMedicineOption`), `:78-109` (`searchMedicinesForBuyer`), `:116-147` (`validateItems`), `:163-177` (`submitOrder`), `:319-329` (`submitShortlist`)
- Test: `tests/actions/buyerOrders.test.ts`

**Interfaces:**
- Consumes: `Medicine.wholesaleBoxPricePaisa`/`wholesalePataPricePaisa` from Task 1
- Produces: `BuyerMedicineOption.wholesalePataPricePaisa` (new); `OrderItemInput` unchanged shape (`{ medicineId, boxes, patas }`, already existed)

- [ ] **Step 1: Write the failing tests**

In `tests/actions/buyerOrders.test.ts`, replace `makeMedicine` (lines 51-66):

```ts
async function makeMedicine(overrides = {}) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
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
    stockPatas: 500,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}
```

Every `submitOrder([{ medicineId: ..., boxes: N }])` call across the file's `submitOrder`, `listMyOrders`, `getMyOrder — ownership`, and `cancelMyOrder — ownership and status` describe blocks needs `patas: 0` added — apply mechanically to every such call site: `{ medicineId: X, boxes: N }` → `{ medicineId: X, boxes: N, patas: 0 }`.

Replace "creates a pending order snapshotting the box price" (lines 104-117):

```ts
it("creates a pending order snapshotting both wholesale rates", async () => {
  await makeSessionBuyer();
  const medicine = await makeMedicine();

  const order = await unwrap(submitOrder([
    { medicineId: String(medicine._id), boxes: 3, patas: 0 },
  ]));

  expect(order.status).toBe("pending");
  expect(order.items[0].medicineName).toBe("Napa 500mg");
  expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
  expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
  expect(order.items[0].boxes).toBe(3);
  expect(order.buyerName).toBe("Karim Uddin");
});

it("bills a loose-patas order line from the wholesale pata rate, not the box rate", async () => {
  await makeSessionBuyer();
  const medicine = await makeMedicine();

  const order = await unwrap(submitOrder([
    { medicineId: String(medicine._id), boxes: 1, patas: 4 },
  ]));

  expect(order.items[0].boxes).toBe(1);
  expect(order.items[0].patas).toBe(4);
  expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
  expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
});
```

Replace "rejects a zero or fractional box count" (lines 132-141) — the guard is now "at least one of boxes/patas" per `validateItems`'s existing `item.boxes === 0 && item.patas === 0` check, already present in the source; only the error string and the added `patas` field change:

```ts
it("rejects a line where both boxes and patas are zero", async () => {
  await makeSessionBuyer();
  const medicine = await makeMedicine();
  await expect(
    unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 0, patas: 0 }])),
  ).rejects.toThrow("Ontoto ekta box ba pata order korte hobe");
});

it("rejects a fractional box or patas count", async () => {
  await makeSessionBuyer();
  const medicine = await makeMedicine();
  await expect(
    unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1.5, patas: 0 }])),
  ).rejects.toThrow("Box er poriman thik nai");
  await expect(
    unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 0, patas: 1.5 }])),
  ).rejects.toThrow("Pata er poriman thik nai");
});
```

Replace `searchMedicinesForBuyer`'s two structural tests (lines 357-388):

```ts
it("returns the buyer-safe fields — availability, never the raw stock or khuchra price", async () => {
  await makeSessionBuyer();
  await makeMedicine({ name: "Napa 500mg", mrpBoxPricePaisa: 15000 });

  const results = await searchMedicinesForBuyer("Napa");
  expect(results).toHaveLength(1);
  expect(results[0]).toEqual({
    id: expect.any(String),
    name: "Napa 500mg",
    company: "Beximco",
    form: "tablet",
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    mrpBoxPricePaisa: 15000,
    // 500 patas, threshold 20 -> comfortably in stock, as a signal only.
    availability: "in",
  });
  // Structural guarantee: the exact stock count and both khuchra (retail)
  // rates never leak onto this object — only the two wholesale rates a
  // wholesale buyer is meant to see, plus the three-way availability.
  const keys = Object.keys(results[0]).sort();
  expect(keys).not.toContain("stockPatas");
  expect(keys).not.toContain("retailBoxPricePaisa");
  expect(keys).not.toContain("retailPataPricePaisa");
  expect(keys).not.toContain("lowStockThreshold");
  expect(keys).toEqual([
    "availability",
    "company",
    "form",
    "id",
    "mrpBoxPricePaisa",
    "name",
    "wholesaleBoxPricePaisa",
    "wholesalePataPricePaisa",
  ]);
});
```

(This replaces both the "returns the medicine form..." test and the "returns the buyer-safe fields..." test with the single canonical shape test above — the form-only test's assertions are a subset of this one.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/buyerOrders.test.ts`
Expected: FAIL — `validateItems` still requires `item.patas` to already be a number in every call (this was already true before this task, per the Global Constraints pre-existing-failure note), and `searchMedicinesForBuyer`/`submitOrder` still read/snapshot `boxPricePaisa` alone.

- [ ] **Step 3: Implement**

Replace `BuyerMedicineOption` (lines 32-46):

```ts
export type BuyerMedicineOption = {
  id: string;
  name: string;
  company: string;
  category: string;
  // Which unit words to show. Not sensitive: it is neither the stock count
  // nor a khuchra (retail) price.
  form: MedicineForm;
  patasPerBox: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
  // The struck-through list price, or 0 for none. Never the internal cost.
  mrpBoxPricePaisa: number;
  // A three-way availability signal, never the exact stock count.
  availability: StockStatus;
};
```

In `searchMedicinesForBuyer`, update the `.select()` call and the lean type and the return mapping (lines 78-109):

```ts
const docs = await MedicineModel.find(findFilter)
  .select(
    "name company category form patasPerBox wholesaleBoxPricePaisa wholesalePataPricePaisa mrpBoxPricePaisa stockPatas lowStockThreshold",
  )
  .sort({ name: 1 })
  .limit(500)
  .lean<
    {
      _id: mongoose.Types.ObjectId;
      name: string;
      company: string;
      category?: string;
      form?: string;
      patasPerBox: number;
      wholesaleBoxPricePaisa: number;
      wholesalePataPricePaisa: number;
      mrpBoxPricePaisa: number;
      stockPatas: number;
      lowStockThreshold: number;
    }[]
  >();

return docs.map((m) => ({
  id: String(m._id),
  name: m.name,
  company: m.company,
  category: m.category ?? "",
  form: toMedicineForm(m.form),
  patasPerBox: m.patasPerBox,
  wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
  wholesalePataPricePaisa: m.wholesalePataPricePaisa,
  mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
  availability: stockStatus(m.stockPatas, m.lowStockThreshold),
}));
```

In `submitOrder`'s line-building loop (lines 168-176):

```ts
lines.push({
  medicineId: medicine._id,
  medicineName: medicine.name,
  form: medicine.form,
  boxes: item.boxes,
  patas: item.patas,
  // Snapshot both wholesale rates the buyer is ordering at.
  wholesaleBoxPricePaisa: medicine.wholesaleBoxPricePaisa,
  wholesalePataPricePaisa: medicine.wholesalePataPricePaisa,
});
```

In `submitShortlist`'s custom-line construction (lines 320-329) — no catalog match yet, so both rates are placeholder 0 like the box rate was before:

```ts
lines.push({
  medicineId: null,
  medicineName: item.name.trim(),
  form: "custom",
  boxes: item.boxes,
  patas: item.patas,
  wholesaleBoxPricePaisa: 0,
  wholesalePataPricePaisa: 0,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/buyerOrders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/buyerOrders.ts tests/actions/buyerOrders.test.ts
git commit -m "feat: snapshot and expose both wholesale rates in the buyer order flow"
```

---

## Task 13: `BuyerBrowse.tsx` — drop proration for the buyer cart total

**Files:**
- Modify: `src/components/BuyerBrowse.tsx:12` (import), `:74-77` (total), `:275-280` (MRP/rate display)

**Interfaces:**
- Consumes: `BuyerMedicineOption` from Task 12 (now has `wholesaleBoxPricePaisa`/`wholesalePataPricePaisa`)

- [ ] **Step 1: Implement**

Drop the `wholesaleLineTotal` import (line 12) — it no longer exists after Task 5. `BuyerBrowse.tsx` imports nothing else from `saleTotals`, so remove the import line entirely.

Replace the cart total (lines 74-77):

```ts
const total = cart.reduce(
  (sum, l) =>
    sum +
    l.boxes * l.medicine.wholesaleBoxPricePaisa +
    l.patas * l.medicine.wholesalePataPricePaisa,
  0,
);
```

In `ProductTableRow`'s MRP column (lines 274-280), the second line currently shows the box price as the "now" price under the struck-through MRP — rename the field reference only, display position unchanged:

```tsx
<span className="text-[13px] font-extrabold text-ink mt-0.5">
  {formatTaka(medicine.wholesaleBoxPricePaisa)}
</span>
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; test suite matches Task 12's result (no test file for this component).

- [ ] **Step 3: Manual browser verification**

Log in as a buyer, browse the catalog, select a medicine with 2 boxes + 5 patas — confirm the running order total in the sticky bar equals `2*wholesaleBoxRate + 5*wholesalePataRate`, not a prorated figure. Confirm the MRP strikethrough still shows correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/BuyerBrowse.tsx
git commit -m "feat: price the buyer cart from explicit wholesale box and pata rates"
```

---

## Task 14: `BuyerOrderList.tsx` and its page — show the patas leg

**Files:**
- Modify: `src/components/BuyerOrderList.tsx:22-28` (`OrderRow`), `:68-99` (total/display)
- Modify: `src/app/(buyer)/buyer/orders/page.tsx:7-18` (row mapping)

**Interfaces:**
- Produces: `OrderRow.items[]` gains `patas: number` and `wholesalePataPricePaisa: number`; `boxPricePaisa` renamed `wholesaleBoxPricePaisa`.

- [ ] **Step 1: Implement**

Replace `OrderRow` (lines 22-28):

```ts
export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  rejectReason: string;
  items: {
    medicineName: string;
    form: string;
    boxes: number;
    patas: number;
    wholesaleBoxPricePaisa: number;
    wholesalePataPricePaisa: number;
  }[];
};
```

Replace the per-order total (lines 68-72) and the per-item list rendering (lines 88-101):

```ts
const total = order.items.reduce(
  (sum, i) =>
    sum + i.boxes * i.wholesaleBoxPricePaisa + i.patas * i.wholesalePataPricePaisa,
  0,
);
```

```tsx
<ul className="mt-3 space-y-1 text-sm text-ink">
  {order.items.map((item, i) => {
    const lineTotal =
      item.boxes * item.wholesaleBoxPricePaisa + item.patas * item.wholesalePataPricePaisa;
    const qtyLabel = [
      item.boxes > 0 ? `${item.boxes} ${unitLabelsFor(item.form).outer}` : null,
      item.patas > 0 ? `${item.patas} ${unitLabelsFor(item.form).inner}` : null,
    ].filter(Boolean).join(" ");
    return (
      <li key={i} className="flex justify-between gap-3">
        <span className="truncate">
          {item.medicineName}{" "}
          <span className="text-muted">× {qtyLabel}</span>
        </span>
        <span className="shrink-0 font-medium">
          {formatTaka(lineTotal)}
        </span>
      </li>
    );
  })}
</ul>
```

In `src/app/(buyer)/buyer/orders/page.tsx`, replace the item mapping (lines 12-17):

```ts
items: o.items.map((i) => ({
  medicineName: i.medicineName,
  form: i.form,
  boxes: i.boxes,
  patas: i.patas,
  wholesaleBoxPricePaisa: i.wholesaleBoxPricePaisa,
  wholesalePataPricePaisa: i.wholesalePataPricePaisa,
})),
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean/unaffected.

- [ ] **Step 3: Manual browser verification**

As a buyer, place an order with both boxes and loose patas (from Task 13's browse screen), then view it under "Amar order" — confirm the quantity label shows both ("2 box 5 pata") and the line/total amounts include the patas leg.

- [ ] **Step 4: Commit**

```bash
git add src/components/BuyerOrderList.tsx "src/app/(buyer)/buyer/orders/page.tsx"
git commit -m "feat: show a buyer's ordered patas and their rate in the order list"
```

---

## Task 15: `adminOrders.ts` — `currentWholesalePrices` returns both rates

**Files:**
- Modify: `src/actions/adminOrders.ts:45-67` (rename `currentBoxPrices` → `currentWholesalePrices`)
- Test: `tests/actions/adminOrders.test.ts`

**Interfaces:**
- Produces: `currentWholesalePrices(medicineIds: string[]): Promise<Record<string, { boxPricePaisa: number; pataPricePaisa: number }>>` (was `currentBoxPrices(...): Promise<Record<string, number>>`)

- [ ] **Step 1: Write the failing tests**

In `tests/actions/adminOrders.test.ts`, replace the `currentBoxPrices` import (line 18) and `makeMedicine`/`makeOrder` fixtures (lines 44-81):

```ts
import {
  listPendingOrders,
  getOrderForAdmin,
  approveOrder,
  rejectOrder,
  currentWholesalePrices,
} from "@/actions/adminOrders";
```

```ts
async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
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
  return medicine;
}

async function makeOrder(
  buyerId: mongoose.Types.ObjectId,
  medicine: { _id: mongoose.Types.ObjectId; name: string; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number },
  boxes = 3,
  patas = 0,
) {
  return OrderModel.create({
    buyerId,
    buyerName: "Karim Uddin",
    buyerShopName: "Karim Medical Hall",
    items: [
      {
        medicineId: medicine._id,
        medicineName: medicine.name,
        boxes,
        patas,
        wholesaleBoxPricePaisa: medicine.wholesaleBoxPricePaisa,
        wholesalePataPricePaisa: medicine.wholesalePataPricePaisa,
      },
    ],
    status: "pending",
  });
}
```

Replace the `describe("currentBoxPrices", ...)` block (lines 87-113):

```ts
describe("currentWholesalePrices", () => {
  it("returns each medicine's current wholesale box and pata rate, not any snapshot", async () => {
    const a = await makeMedicine();
    const b = await makeMedicine({ name: "Ace", wholesaleBoxPricePaisa: 5000, wholesalePataPricePaisa: 550 });
    // Raise A's rates after it was made — the current rate is what matters.
    await MedicineModel.updateOne(
      { _id: a._id },
      { $set: { wholesaleBoxPricePaisa: 13000, wholesalePataPricePaisa: 1350 } },
    );

    const prices = await currentWholesalePrices([String(a._id), String(b._id)]);
    expect(prices[String(a._id)]).toEqual({ boxPricePaisa: 13000, pataPricePaisa: 1350 });
    expect(prices[String(b._id)]).toEqual({ boxPricePaisa: 5000, pataPricePaisa: 550 });
  });

  it("omits a deactivated or unknown medicine so the caller falls back to the snapshot", async () => {
    const gone = await makeMedicine({ active: false });
    const prices = await currentWholesalePrices([
      String(gone._id),
      "507f1f77bcf86cd799439011",
      "not-an-id",
    ]);
    expect(prices).toEqual({});
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(currentWholesalePrices([])).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
```

Update every other `makeOrder`/`makeTwoItemOrder` call site's item literal in the file (`approveOrder`, `rejectOrder`, `zero-quantity approval lines` blocks) that still constructs an order item inline with `boxPricePaisa` — the two `OrderModel.create` calls inside `makeTwoItemOrder` (lines 282-301) — to the renamed fields:

```ts
return OrderModel.create({
  buyerId,
  buyerName: "Karim Uddin",
  buyerShopName: "Karim Medical Hall",
  items: [
    {
      medicineId: supplied._id,
      medicineName: supplied.name,
      boxes: 3,
      wholesaleBoxPricePaisa: supplied.wholesaleBoxPricePaisa,
      wholesalePataPricePaisa: supplied.wholesalePataPricePaisa,
    },
    {
      medicineId: outOfStock._id,
      medicineName: outOfStock.name,
      boxes: 10,
      wholesaleBoxPricePaisa: outOfStock.wholesaleBoxPricePaisa,
      wholesalePataPricePaisa: outOfStock.wholesalePataPricePaisa,
    },
  ],
  status: "pending",
});
```

(Its type signature also needs the two renamed fields instead of `boxPricePaisa` — update the parameter types accordingly.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/adminOrders.test.ts`
Expected: FAIL — `currentBoxPrices` doesn't exist under the new name yet, and `makeMedicine`/`makeOrder` reference fields the schema no longer has.

- [ ] **Step 3: Implement**

In `src/actions/adminOrders.ts`, replace `currentBoxPrices` (lines 45-67):

```ts
/**
 * The current wholesale box and pata rate of each given medicine, keyed by
 * medicine id.
 *
 * An order snapshots the rates the buyer saw, but approval bills at the
 * medicine's *current* rates (see approveOrder → writeWholesaleSale). The
 * pending-orders screen shows this map so its preview total matches the
 * invoice the owner is about to create — a snapshot-priced preview would
 * quietly disagree with the sale whenever a rate changed since the order.
 * A medicine that no longer exists or is deactivated is simply absent; the
 * caller falls back to the order's own snapshot for display.
 */
export async function currentWholesalePrices(
  medicineIds: string[],
): Promise<Record<string, { boxPricePaisa: number; pataPricePaisa: number }>> {
  await requireAdminAction();
  await connectDb();

  if (!Array.isArray(medicineIds)) return {};
  const validIds = medicineIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (validIds.length === 0) return {};

  const medicines = await MedicineModel.find({
    _id: { $in: validIds },
    active: true,
  })
    .select("wholesaleBoxPricePaisa wholesalePataPricePaisa")
    .lean<{ _id: mongoose.Types.ObjectId; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number }[]>();

  return Object.fromEntries(
    medicines.map((m) => [
      m._id.toString(),
      { boxPricePaisa: m.wholesaleBoxPricePaisa, pataPricePaisa: m.wholesalePataPricePaisa },
    ]),
  );
}
```

`approveOrder`/`validateApproval`/`ApprovalItemInput` need no change in this task — they already pass `boxes`/`patas` straight through to `writeWholesaleSale` (Task 6), which now reads the medicine's rates directly rather than through any field this function touches.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/adminOrders.test.ts`
Expected: PASS, except `approveOrder > refuses an item not in the order`, which is the pre-existing out-of-scope failure noted in Global Constraints — confirm it fails for the same reason as before this task, not a new one.

- [ ] **Step 5: Commit**

```bash
git add src/actions/adminOrders.ts tests/actions/adminOrders.test.ts
git commit -m "feat: rename currentBoxPrices to currentWholesalePrices, returning both rates"
```

---

## Task 16: `OrderEditor.tsx` — bill the patas a buyer actually ordered

**Files:**
- Modify: `src/components/OrderEditor.tsx:13-51` (`EditingItem`, initial state)
- Modify: `src/components/OrderEditor.tsx:70-115` (`addMedicine`, `addCustomItem`)
- Modify: `src/components/OrderEditor.tsx:130-136` (approve payload)
- Modify: `src/components/OrderEditor.tsx:172-175` (subtotal)
- Modify: `src/components/OrderEditor.tsx:225-277` (item card JSX)
- Modify: `src/app/(admin)/orders/[id]/edit/page.tsx:2,26` (`currentBoxPrices` → `currentWholesalePrices`)

**Interfaces:**
- Consumes: `currentWholesalePrices` from Task 15, `PickedMedicine` from Task 7

This is the fix for Problem #5 in the spec: today this screen hardcodes `patas: 0` for every line it loads, silently dropping whatever the buyer actually ordered.

- [ ] **Step 1: Implement**

Replace `EditingItem` (lines 13-23):

```ts
type EditingItem = {
  id: string; // medicineId or custom_X
  medicineId?: string;
  customName?: string;
  medicineName: string;
  boxes: number;
  patas: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  form: string;
  isAdded: boolean;
};
```

Update the `OrderEditor` props and initial-state mapping (lines 25-51):

```ts
export function OrderEditor({
  order,
  currentPrices,
}: {
  order: PendingOrderRow;
  currentPrices: Record<string, { boxPricePaisa: number; pataPricePaisa: number }>;
}) {
  const router = useRouter();

  const [items, setItems] = useState<EditingItem[]>(() => {
    let customCounter = 0;
    return order.items.map((i) => {
      const isCustom = !i.medicineId;
      const id = isCustom ? `custom_req_${customCounter++}` : String(i.medicineId);
      const current = i.medicineId ? currentPrices[String(i.medicineId)] : undefined;
      return {
        id,
        medicineId: i.medicineId ? String(i.medicineId) : undefined,
        customName: isCustom ? i.medicineName : undefined,
        medicineName: i.medicineName,
        boxes: i.boxes,
        // Was hardcoded to 0 here, silently dropping whatever the buyer
        // actually ordered — now carries the order's own patas through.
        patas: i.patas,
        boxPricePaisa: current?.boxPricePaisa ?? i.wholesaleBoxPricePaisa,
        pataPricePaisa: current?.pataPricePaisa ?? i.wholesalePataPricePaisa,
        form: i.form,
        isAdded: false,
      };
    });
  });
```

Replace `addMedicine` (lines 70-86):

```ts
const addMedicine = (medicine: PickedMedicine) => {
  if (items.some((i) => i.medicineId === medicine.id)) return;
  const current = currentPrices[medicine.id];
  setItems((prev) => [
    ...prev,
    {
      id: medicine.id,
      medicineId: medicine.id,
      medicineName: medicine.name,
      boxes: 1,
      patas: 0,
      boxPricePaisa: current?.boxPricePaisa ?? medicine.wholesaleBoxPricePaisa,
      pataPricePaisa: current?.pataPricePaisa ?? medicine.wholesalePataPricePaisa,
      form: medicine.form,
      isAdded: true,
    },
  ]);
  setPickerOpen(false);
};
```

Replace `addCustomItem` (lines 88-115) — a custom item stays box-only, priced flat, matching `writeWholesaleSale`'s custom-item branch (Task 6, unchanged):

```ts
const addCustomItem = () => {
  if (!customName.trim()) {
    alert("Nam dite hobe");
    return;
  }
  const parsedPrice = parseFloat(customPrice);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    alert("Thikmoto dam din");
    return;
  }
  const pricePaisa = Math.round(takaToPaisa(parsedPrice));
  setItems((prev) => [
    ...prev,
    {
      id: `custom_added_${Date.now()}`,
      customName: customName.trim(),
      medicineName: customName.trim(),
      boxes: customBoxes,
      patas: 0,
      boxPricePaisa: pricePaisa,
      pataPricePaisa: pricePaisa,
      form: "other",
      isAdded: true,
    },
  ]);
  setShowCustomForm(false);
  setCustomName("");
  setCustomPrice("");
  setCustomBoxes(1);
};
```

In `handleApprove` (lines 117-151), update the approval payload's custom-price mapping (line 133) — a custom item's flat price is now `boxPricePaisa` (unchanged name on `EditingItem`, still the field `customPricePaisa` maps from):

```ts
const inputItems = items.map((i) => ({
  medicineId: i.medicineId,
  customName: i.customName,
  customPricePaisa: i.boxPricePaisa,
  boxes: i.boxes,
  patas: i.patas,
}));
```

(No other change needed here — `patas` was already being sent, just previously always 0 from the broken initial state.)

Replace the subtotal calculation (lines 172-175), which today explicitly comments "Treat patas as 0 here since it's unhandled by UI":

```ts
const subtotalPaisa = items.reduce((sum, item) => {
  return sum + item.boxPricePaisa * item.boxes + item.pataPricePaisa * item.patas;
}, 0);
```

In the item card JSX (lines 220-278), add a patas input next to the existing boxes stepper for catalog items (custom items stay box-only, matching `writeWholesaleSale`) and update the rate/total display:

```tsx
{/* Price Section */}
<div className="flex-1 min-w-[140px]">
  <label className="block text-xs font-semibold text-muted mb-1">Rate</label>
  {isCustom ? (
     <div className="flex items-center gap-2">
       <span className="text-sm font-medium">৳</span>
       <input
         type="number"
         placeholder="Price"
         value={item.boxPricePaisa > 0 ? (item.boxPricePaisa / 100).toString() : ""}
         onChange={(e) => {
           const pricePaisa = Math.round(takaToPaisa(parseFloat(e.target.value) || 0));
           updateItem(item.id, { boxPricePaisa: pricePaisa, pataPricePaisa: pricePaisa });
         }}
         className="w-full max-w-[100px] rounded-lg border border-line px-2 py-1.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
       />
     </div>
  ) : (
    <div className="text-sm font-semibold">
      {formatTaka(item.boxPricePaisa)}<span className="text-xs text-muted font-normal">/{labels.outer}</span>
      {" · "}
      {formatTaka(item.pataPricePaisa)}<span className="text-xs text-muted font-normal">/{labels.inner}</span>
    </div>
  )}
</div>

{/* Quantity Section */}
<div className="flex-1 min-w-[150px] flex items-center justify-end gap-3">
   <div className="flex items-center gap-1 bg-canvas rounded-full border border-line p-1">
     <button
       onClick={() => updateItem(item.id, { boxes: Math.max(0, item.boxes - 1) })}
       className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink shadow hover:bg-line/50 transition"
     >
       -
     </button>
     <input
       type="number"
       min={0}
       value={item.boxes}
       onChange={(e) => updateItem(item.id, { boxes: parseQuantityInput(e.target.value, 0) })}
       className="w-12 text-center text-sm font-bold bg-transparent outline-none appearance-none"
     />
     <button
       onClick={() => updateItem(item.id, { boxes: item.boxes + 1 })}
       className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow hover:bg-brand-strong transition"
     >
       +
     </button>
   </div>
   <span className="text-xs font-medium text-muted w-10">{labels.outer}</span>
   {!isCustom && (
     <>
       <input
         type="number"
         min={0}
         value={item.patas}
         onChange={(e) => updateItem(item.id, { patas: parseQuantityInput(e.target.value, 0) })}
         className="w-12 rounded-full border border-line bg-canvas text-center text-sm font-bold outline-none"
       />
       <span className="text-xs font-medium text-muted w-10">{labels.inner}</span>
     </>
   )}
</div>
```

```tsx
<div className="mt-3 flex justify-between items-center bg-canvas -mx-4 -mb-4 px-4 py-2 border-t border-line/50">
   <div className="text-xs font-semibold text-brand-strong">
     Total: {formatTaka(item.boxPricePaisa * item.boxes + item.pataPricePaisa * item.patas)}
   </div>
   {item.isAdded && (
     <button onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="text-xs text-danger font-medium hover:underline">
       Remove
     </button>
   )}
</div>
```

In `src/app/(admin)/orders/[id]/edit/page.tsx`, rename the import and call (lines 2, 26):

```ts
import { getOrderForAdmin, currentWholesalePrices } from "@/actions/adminOrders";
```

```ts
const priceMap = await currentWholesalePrices(uniqueMedicineIds);
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; test suite matches Task 15's result.

- [ ] **Step 3: Manual browser verification**

As a buyer, submit an order with 4 boxes + 6 patas of a medicine (Task 13). As the owner, open Pending Orders → Edit on that order — confirm the line shows both a box stepper and a patas input, the patas input is pre-filled with 6 (not 0), the displayed rate shows both box and pata rates, and the line/subtotal total includes the patas leg. Approve it and confirm the resulting invoice bills both legs correctly. Add a new catalog product to the same edit screen and confirm its patas input works too. Add a custom item and confirm it stays box-only with a flat price.

- [ ] **Step 4: Commit**

```bash
git add src/components/OrderEditor.tsx "src/app/(admin)/orders/[id]/edit/page.tsx"
git commit -m "fix: bill an order's actual patas at approval instead of always zero"
```

---

## Task 17: `PendingOrders.tsx` — one-click approve includes patas

**Files:**
- Modify: `src/components/PendingOrders.tsx:37-65` (`handleApprove`)
- Modify: `src/components/PendingOrders.tsx:97-102, 131-136` (preview total/display)

**Interfaces:**
- Consumes: `approveOrder` (Task 15, unchanged signature, now correctly billing patas via `writeWholesaleSale`)

This is the other half of Problem #5: today's one-click approve never sends `patas` to `approveOrder` at all, so a buyer's loose-patas order line is billed as if it were zero.

- [ ] **Step 1: Implement**

Replace `handleApprove`'s `approvalItems` mapping (lines 49-52):

```ts
const approvalItems = order.items.map(item => ({
  medicineId: item.medicineId || undefined,
  boxes: item.boxes,
  patas: item.patas,
}));
```

Replace the per-order preview total (lines 98-102) and the per-line price cell (line 135), both of which today read `item.boxPricePaisa * item.boxes` only:

```ts
const totalPaisa = order.items.reduce(
  (sum, item) =>
    sum + item.boxes * item.wholesaleBoxPricePaisa + item.patas * item.wholesalePataPricePaisa,
  0
);
```

```tsx
<td className="py-2 px-3 text-right font-medium text-ink whitespace-nowrap">
  {item.boxes} {unitLabelsFor(item.form).outer}
  {item.patas > 0 && ` ${item.patas} ${unitLabelsFor(item.form).inner}`}
</td>
<td className="py-2 px-3 text-right text-muted whitespace-nowrap">
  {item.medicineId
    ? formatTaka(item.boxes * item.wholesaleBoxPricePaisa + item.patas * item.wholesalePataPricePaisa)
    : "Pending"}
</td>
```

- [ ] **Step 2: Run typecheck and the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; test suite matches Task 15's result.

- [ ] **Step 3: Manual browser verification**

As a buyer, submit a catalog-only order (no custom/shortlist items) with both boxes and patas. As the owner, on the Pending Orders list (not the edit screen), confirm the row's quantity and price preview include the patas leg, then click Approve — confirm the resulting sale bills both legs, matching what Task 16's edit-screen path produces for the same order shape.

- [ ] **Step 4: Commit**

```bash
git add src/components/PendingOrders.tsx
git commit -m "fix: bill an order's patas on one-click approve, not just boxes"
```

---

## Task 18: Migration script for existing Atlas data

**Files:**
- Create: `scripts/migrate-pricing-fields.ts`
- Test: none (a one-off operational script against live data, per this repo's existing convention — see `scripts/migrate-invoice-index.ts`). Verified by a dry run against a disposable local Mongo instance, not Vitest.

**Interfaces:**
- Consumes: field names finalized in Tasks 1 and 11

- [ ] **Step 1: Implement**

Create `scripts/migrate-pricing-fields.ts`:

```ts
/**
 * Migrates the `medicines` and `orders` collections from the old two-field
 * pricing model (boxPricePaisa/pataPricePaisa) to the five-field model:
 * purchasePricePaisa, wholesaleBoxPricePaisa, wholesalePataPricePaisa,
 * retailBoxPricePaisa, retailPataPricePaisa.
 *
 * medicines: boxPricePaisa -> wholesaleBoxPricePaisa (rename, same value)
 *            pataPricePaisa -> retailPataPricePaisa (rename, same value)
 *            wholesalePataPricePaisa = round(boxPricePaisa / patasPerBox)
 *            retailBoxPricePaisa = pataPricePaisa * patasPerBox
 *            purchasePricePaisa = 0 (no historical cost data exists)
 *
 * orders (every status, every line in items[]):
 *            items[].boxPricePaisa -> items[].wholesaleBoxPricePaisa (rename)
 *            items[].wholesalePataPricePaisa = 0 (no such rate existed when
 *              these orders were placed — see the design spec's Problem #5:
 *              any patas already on these lines were being billed as free,
 *              so 0 does not retroactively invent a charge for them)
 *
 * Safe to re-run: a document with no boxPricePaisa field (already migrated,
 * or created after this code shipped) is left untouched.
 *
 * Usage: npx tsx scripts/migrate-pricing-fields.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function migrateMedicines(db: mongoose.mongo.Db) {
  const collection = db.collection("medicines");
  const cursor = collection.find({ boxPricePaisa: { $exists: true } });

  let count = 0;
  for await (const doc of cursor) {
    const boxPricePaisa = doc.boxPricePaisa as number;
    const pataPricePaisa = doc.pataPricePaisa as number;
    const patasPerBox = doc.patasPerBox as number;

    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          wholesaleBoxPricePaisa: boxPricePaisa,
          retailPataPricePaisa: pataPricePaisa,
          wholesalePataPricePaisa: Math.round(boxPricePaisa / patasPerBox),
          retailBoxPricePaisa: pataPricePaisa * patasPerBox,
          purchasePricePaisa: doc.purchasePricePaisa ?? 0,
        },
        $unset: { boxPricePaisa: "", pataPricePaisa: "" },
      },
    );
    count++;
  }
  console.log(`medicines: migrated ${count} document(s).`);
}

async function migrateOrders(db: mongoose.mongo.Db) {
  const collection = db.collection("orders");
  const cursor = collection.find({ "items.boxPricePaisa": { $exists: true } });

  let count = 0;
  for await (const doc of cursor) {
    const items = (doc.items as Record<string, unknown>[]).map((item) => {
      if (!("boxPricePaisa" in item)) return item;
      const { boxPricePaisa, ...rest } = item;
      return {
        ...rest,
        wholesaleBoxPricePaisa: boxPricePaisa,
        wholesalePataPricePaisa: (item.wholesalePataPricePaisa as number | undefined) ?? 0,
      };
    });
    await collection.updateOne({ _id: doc._id }, { $set: { items } });
    count++;
  }
  console.log(`orders: migrated ${count} document(s).`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  await migrateMedicines(db);
  await migrateOrders(db);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run against a disposable local instance**

This script is not covered by Vitest (per this repo's existing convention for one-off migration scripts — see `scripts/migrate-invoice-index.ts`, which also has no test file). Verify it manually:

```bash
# Start a throwaway local MongoDB (or use an existing local/dev instance —
# never point this at the Atlas MONGODB_URI from .env for this dry run).
MONGODB_URI="mongodb://127.0.0.1:27017/pricing-migration-dryrun" npx tsx -e "
  import('mongoose').then(async ({ default: mongoose }) => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await mongoose.connection.db!.collection('medicines').insertOne({
      name: 'Test', nameLower: 'test', patasPerBox: 10,
      boxPricePaisa: 12000, pataPricePaisa: 1400, stockPatas: 0,
      lowStockThreshold: 0, active: true,
    });
    await mongoose.disconnect();
  });
"
MONGODB_URI="mongodb://127.0.0.1:27017/pricing-migration-dryrun" npx tsx scripts/migrate-pricing-fields.ts
```

Expected output: `medicines: migrated 1 document(s).` / `orders: migrated 0 document(s).`. Inspect the migrated document (e.g. via `mongosh` or a quick `find()` script) and confirm: `wholesaleBoxPricePaisa: 12000`, `retailPataPricePaisa: 1400`, `wholesalePataPricePaisa: 1200` (12000/10), `retailBoxPricePaisa: 14000` (1400*10), `purchasePricePaisa: 0`, and that `boxPricePaisa`/`pataPricePaisa` are gone. Run the script a second time against the same database and confirm it reports `0` migrated (the `$exists` filter now matches nothing) — this is the "safe to re-run" check.

Repeat with a throwaway `orders` document containing an item with `boxPricePaisa` and confirm the same rename/zero-fill behaviour, then drop the dry-run database.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-pricing-fields.ts
git commit -m "chore: add the medicines/orders pricing-field migration script"
```

*(Running this script against the live Atlas database is a separate, deliberate step the owner takes when ready to ship — not part of this commit. See Task 19's final verification for the reminder.)*

---

## Task 19: Whole-plan verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck and test suite**

Run: `npx tsc --noEmit && npx vitest run`

Expected: typecheck clean. Test suite: compare the failing-test list against the Global Constraints' pre-existing baseline (`stockStatus.test.ts`'s 3 failures, `authorization.test.ts`'s 1 failure, `adminOrders.test.ts > approveOrder > refuses an item not in the order`, and `Order.test.ts > rejects a box count below 1` per Task 11) — every other previously-failing test (in `sales.test.ts`, `buyerOrders.test.ts`, `medicines.test.ts`'s pricing-related tests, `saleTotals.test.ts`) must now pass, and no test that passed before this plan started may now fail.

- [ ] **Step 2: Browser walkthrough, in order**

- Add a new medicine (Task 3) with distinct purchase/wholesale-box/wholesale-pata/khuchra-box/khuchra-pata/MRP rates; confirm it saves and the medicine list (Task 4) shows the right two summary columns.
- Run a mixed wholesale sale (Task 8) — boxes + loose patas — and hand-check the invoice total against `boxes*wholesaleBoxRate + patas*wholesalePataRate`.
- Run a retail sale (Task 10) with a box line and a separate pata line; hand-check both against the khuchra rates.
- Confirm an "other"-form medicine (Task 3) still shows one rate input per channel and that channel's box/pata rates come out equal after saving.
- As a buyer (Task 13), order a medicine with both boxes and loose patas; confirm the cart total and the order-history total (Task 14) both match the two-rate formula.
- As the owner, open that order for approval via the Edit screen (Task 16) — confirm the patas show up pre-filled, not zero, and approve it; hand-check the resulting invoice.
- Repeat with a second buyer order that has no custom/shortlist lines, approved via the Pending Orders one-click button (Task 17) instead of the edit screen; confirm it bills the patas too.
- Confirm the migration script (Task 18) is ready but has **not** been run against the live Atlas database — that is the owner's call, made when this branch ships, not part of this plan's automated steps.

- [ ] **Step 3: Report to the owner**

Summarize in Banglish: what changed (five explicit rates replacing two, retail box selling, wholesale/buyer-order patas billed at their own rate instead of prorated or dropped), and that the migration script (Task 18) still needs to be run against Atlas once this is ready to ship, same as `scripts/migrate-invoice-index.ts` was for its own change.
