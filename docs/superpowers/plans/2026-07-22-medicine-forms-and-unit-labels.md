# Medicine Forms and Unit Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a medicine declare what kind of product it is, so the app stops calling a syrup's units "box" and "pata" and calls them "carton" and "bottle" everywhere.

**Architecture:** One new field, `Medicine.form`, plus one new module, `src/lib/unitLabels.ts`, which is the single source of every user-visible unit word. Stock arithmetic, money, and all existing database field names are untouched — a syrup carton of 12 bottles is arithmetically identical to a box of 10 patas. Sale lines, order lines, and stock entries snapshot the `form` alongside the data they already snapshot, so a past invoice never re-words itself.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Mongoose 9, TypeScript, Tailwind 4, Vitest + mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-07-22-medicine-forms-and-unit-labels-design.md`

## Global Constraints

- **This is not the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing framework code. No task here adds a route or changes routing, so this should not come up — but heed it if it does.
- **All user-facing copy is Banglish** — Bengali written in Latin letters, never Bengali script. Match the surrounding tone (`"Kichu ekta bhul holo"`, `"Koto box dhuklo"`).
- **Unit words are lowercase in `unitLabels.ts`** (`"carton"`, not `"Carton"`). Call sites that need a capital use the exported `capitalize()`.
- **Never rename** `stockPatas`, `patasPerBox`, `pataPricePaisa`, `boxPricePaisa`, `patasDeducted`, `patasAdded`, or `Sale.items[].unit`. They are internal names whose meaning holds under every form.
- **Money is integer paisa, stock is integer patas.** No task here touches either.
- **Run tests with `npm test`** (vitest, single run). A single file: `npm test -- tests/lib/units.test.ts`.
- **Commit after every task.** Do not squash tasks into one commit.

---

## File Structure

**Created**
- `src/lib/unitLabels.ts` — the form list and every unit word. Pure, no imports.
- `tests/lib/unitLabels.test.ts` — its tests.

**Modified**
- `src/lib/units.ts` — `formatStock` takes a form.
- `src/models/Medicine.ts` — `form` field.
- `src/models/Sale.ts`, `src/models/Order.ts`, `src/models/StockEntry.ts` — snapshot `form`.
- `src/actions/medicines.ts` — validate and store `form`.
- `src/actions/stock.ts`, `src/actions/sales.ts`, `src/actions/buyerOrders.ts`, `src/lib/writeWholesaleSale.ts` — copy `form` into snapshots.
- `src/actions/dashboard.ts` — `form` on `LowStockRow`.
- `src/app/(admin)/medicines/page.tsx`, `src/app/(admin)/orders/page.tsx`, `src/app/(admin)/stock/page.tsx`, `src/app/(buyer)/buyer/orders/page.tsx`, `src/app/invoice/[id]/page.tsx` — carry `form` to their components.
- `src/components/MedicineForm.tsx`, `MedicineTable.tsx`, `MedicinePicker.tsx`, `StockInForm.tsx`, `RetailSaleForm.tsx`, `WholesaleSaleForm.tsx`, `DashboardCards.tsx`, `PendingOrders.tsx`, `BuyerOrderList.tsx`, `BuyerBrowse.tsx`, `Invoice.tsx` — read words from `unitLabels`.
- `tests/lib/units.test.ts`, `tests/actions/medicines.test.ts` — updated and extended.

---

### Task 1: The unit-label module

The one place any unit word comes from. Pure and standalone — nothing else in the codebase changes in this task.

**Files:**
- Create: `src/lib/unitLabels.ts`
- Test: `tests/lib/unitLabels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MEDICINE_FORMS: readonly ["tablet","syrup","injection","cream","drops"]`
  - `type MedicineForm = "tablet" | "syrup" | "injection" | "cream" | "drops"`
  - `type UnitLabels = { formLabel: string; outer: string; inner: string; outerShort: string; innerShort: string }`
  - `DEFAULT_MEDICINE_FORM: MedicineForm` (`"tablet"`)
  - `isMedicineForm(value: unknown): value is MedicineForm`
  - `toMedicineForm(value: unknown): MedicineForm`
  - `unitLabelsFor(form: unknown): UnitLabels`
  - `capitalize(word: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/unitLabels.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MEDICINE_FORMS,
  DEFAULT_MEDICINE_FORM,
  isMedicineForm,
  toMedicineForm,
  unitLabelsFor,
  capitalize,
} from "@/lib/unitLabels";

describe("unitLabelsFor", () => {
  it("gives tablets the box/pata wording", () => {
    expect(unitLabelsFor("tablet")).toEqual({
      formLabel: "Tablet / Capsule",
      outer: "box",
      inner: "pata",
      outerShort: "bx",
      innerShort: "pt",
    });
  });

  it("gives syrups the carton/bottle wording", () => {
    const labels = unitLabelsFor("syrup");
    expect(labels.outer).toBe("carton");
    expect(labels.inner).toBe("bottle");
    expect(labels.outerShort).toBe("ctn");
    expect(labels.innerShort).toBe("btl");
  });

  it("names the inner unit per form", () => {
    expect(unitLabelsFor("injection").inner).toBe("vial");
    expect(unitLabelsFor("cream").inner).toBe("tube");
    expect(unitLabelsFor("drops").inner).toBe("piece");
  });

  // A medicine saved before `form` existed comes back from a .lean() query
  // with no form at all — Mongoose applies schema defaults when it builds a
  // document, not when a lean query hands back raw BSON. Those are all
  // tablets, and a page must never break over a cosmetic field.
  it("falls back to tablet wording for missing or unknown values", () => {
    for (const bad of [undefined, null, "", "  ", "ointment", 7, {}, []]) {
      expect(unitLabelsFor(bad)).toEqual(unitLabelsFor("tablet"));
    }
  });

  it("has an entry for every declared form", () => {
    for (const form of MEDICINE_FORMS) {
      const labels = unitLabelsFor(form);
      expect(labels.formLabel.length).toBeGreaterThan(0);
      expect(labels.outer.length).toBeGreaterThan(0);
      expect(labels.inner.length).toBeGreaterThan(0);
      expect(labels.outerShort.length).toBeGreaterThan(0);
      expect(labels.innerShort.length).toBeGreaterThan(0);
    }
  });

  it("keeps every word lowercase, so call sites control capitalisation", () => {
    for (const form of MEDICINE_FORMS) {
      const { outer, inner, outerShort, innerShort } = unitLabelsFor(form);
      for (const word of [outer, inner, outerShort, innerShort]) {
        expect(word).toBe(word.toLowerCase());
      }
    }
  });

  it("keeps the invoice abbreviations short enough for 80mm paper", () => {
    for (const form of MEDICINE_FORMS) {
      const { outerShort, innerShort } = unitLabelsFor(form);
      expect(outerShort.length).toBeLessThanOrEqual(3);
      expect(innerShort.length).toBeLessThanOrEqual(3);
    }
  });
});

describe("isMedicineForm", () => {
  it("accepts every declared form", () => {
    for (const form of MEDICINE_FORMS) {
      expect(isMedicineForm(form)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const bad of [undefined, null, "", "ointment", "TABLET", 7, {}]) {
      expect(isMedicineForm(bad)).toBe(false);
    }
  });
});

describe("toMedicineForm", () => {
  it("passes a valid form through", () => {
    expect(toMedicineForm("syrup")).toBe("syrup");
  });

  it("narrows anything else to the default", () => {
    expect(toMedicineForm(undefined)).toBe(DEFAULT_MEDICINE_FORM);
    expect(toMedicineForm("ointment")).toBe("tablet");
  });
});

describe("capitalize", () => {
  it("uppercases the first letter only", () => {
    expect(capitalize("carton")).toBe("Carton");
    expect(capitalize("pata")).toBe("Pata");
  });

  it("handles an empty string without throwing", () => {
    expect(capitalize("")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/unitLabels.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/unitLabels"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/unitLabels.ts`:

```ts
/**
 * Every user-visible unit word in the app comes from this table.
 *
 * Stock arithmetic is form-agnostic: a syrup carton holding 12 bottles is the
 * same shape as a tablet box holding 10 patas — an outer pack, an inner unit,
 * and an integer conversion (see src/lib/units.ts). Only the words differ, so
 * the words live in one place instead of being spelled out at each screen.
 */

export const MEDICINE_FORMS = [
  "tablet",
  "syrup",
  "injection",
  "cream",
  "drops",
] as const;

export type MedicineForm = (typeof MEDICINE_FORMS)[number];

export type UnitLabels = {
  /** What the medicine form picker calls this form. */
  formLabel: string;
  /** The outer pack, lowercase: "box", "carton". */
  outer: string;
  /** The inner unit, lowercase: "pata", "bottle". */
  inner: string;
  /** The outer pack on an 80mm invoice, where width is scarce: "bx", "ctn". */
  outerShort: string;
  /** The inner unit on an 80mm invoice: "pt", "btl". */
  innerShort: string;
};

export const DEFAULT_MEDICINE_FORM: MedicineForm = "tablet";

const LABELS: Record<MedicineForm, UnitLabels> = {
  tablet: {
    formLabel: "Tablet / Capsule",
    outer: "box",
    inner: "pata",
    outerShort: "bx",
    innerShort: "pt",
  },
  syrup: {
    formLabel: "Syrup / Suspension",
    outer: "carton",
    inner: "bottle",
    outerShort: "ctn",
    innerShort: "btl",
  },
  injection: {
    formLabel: "Injection / Vial",
    outer: "box",
    inner: "vial",
    outerShort: "bx",
    innerShort: "vl",
  },
  cream: {
    formLabel: "Cream / Ointment",
    outer: "box",
    inner: "tube",
    outerShort: "bx",
    innerShort: "tb",
  },
  drops: {
    formLabel: "Drops / Inhaler",
    outer: "box",
    inner: "piece",
    outerShort: "bx",
    innerShort: "pc",
  },
};

export function isMedicineForm(value: unknown): value is MedicineForm {
  return (
    typeof value === "string" &&
    (MEDICINE_FORMS as readonly string[]).includes(value)
  );
}

/**
 * Narrows a stored value to a form. Takes `unknown` on purpose: callers include
 * `.lean()` query results and snapshotted sale lines, where a document written
 * before this field existed arrives as `undefined` — Mongoose applies schema
 * defaults when it builds a document, not when a lean query hands back raw
 * BSON. Those documents are all tablets, and an unrecognised value from a newer
 * client should render plain wording rather than crash a page, so both fall
 * back to the default.
 */
export function toMedicineForm(value: unknown): MedicineForm {
  return isMedicineForm(value) ? value : DEFAULT_MEDICINE_FORM;
}

export function unitLabelsFor(form: unknown): UnitLabels {
  return LABELS[toMedicineForm(form)];
}

/** "carton" -> "Carton", for a table header or the start of a sentence. */
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/unitLabels.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/unitLabels.ts tests/lib/unitLabels.test.ts
git commit -m "feat: add the medicine form list and its unit labels"
```

---

### Task 2: Store a medicine's form

Adds the field to the model and the write path. After this task a syrup can be saved; nothing displays differently yet.

**Files:**
- Modify: `src/models/Medicine.ts`
- Modify: `src/actions/medicines.ts`
- Test: `tests/actions/medicines.test.ts`

**Interfaces:**
- Consumes: `MEDICINE_FORMS`, `MedicineForm`, `isMedicineForm`, `toMedicineForm`, `DEFAULT_MEDICINE_FORM` from Task 1.
- Produces: `MedicineDoc.form: string`; `MedicineInput.form?: MedicineForm` (optional — omitting it stores `"tablet"`).

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/actions/medicines.test.ts`:

```ts
describe("medicine form", () => {
  it("defaults to tablet when no form is given", async () => {
    const medicine = await createMedicine(napa);
    expect(medicine.form).toBe("tablet");
  });

  it("stores the form it is given", async () => {
    const medicine = await createMedicine({
      ...napa,
      name: "Napa Syrup",
      form: "syrup",
    });
    expect(medicine.form).toBe("syrup");
  });

  it("rejects a form that is not one of the known ones", async () => {
    await expect(
      createMedicine({
        ...napa,
        name: "Weird",
        // Deliberately invalid: this is a network-reachable boundary and the
        // payload does not have to come from our own form picker.
        form: "ointment" as never,
      }),
    ).rejects.toThrow("Medicine form thik nai");
  });

  it("lets an edit change the form without touching stock", async () => {
    const created = await createMedicine(napa);
    const updated = await updateMedicine(created._id, {
      ...napa,
      form: "syrup",
    });
    expect(updated.form).toBe("syrup");
    expect(updated.stockPatas).toBe(created.stockPatas);
  });

  it("resets an edited medicine to tablet when the form is omitted", async () => {
    const created = await createMedicine({ ...napa, form: "syrup" });
    const updated = await updateMedicine(created._id, napa);
    expect(updated.form).toBe("tablet");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/medicines.test.ts`
Expected: FAIL — the first new test fails with `expected undefined to be 'tablet'`, and TypeScript flags `form` as not existing on `MedicineInput`.

- [ ] **Step 3: Add the field to the model**

In `src/models/Medicine.ts`, add the import at the top:

```ts
import { MEDICINE_FORMS } from "@/lib/unitLabels";
```

and add this field to `medicineSchema`, directly after `company`:

```ts
    // Which unit words this medicine is described with — box/pata for a
    // tablet strip, carton/bottle for a syrup. Display only: every stock and
    // price field below means the same thing under every form, which is why
    // none of them is renamed. See src/lib/unitLabels.ts.
    form: {
      type: String,
      enum: [...MEDICINE_FORMS],
      required: true,
      default: "tablet",
    },
```

- [ ] **Step 4: Validate and store it in the action**

In `src/actions/medicines.ts`:

Add to the imports:

```ts
import {
  isMedicineForm,
  toMedicineForm,
  type MedicineForm,
} from "@/lib/unitLabels";
```

Add to `MedicineInput`, after `company`:

```ts
  // Which unit words this medicine is shown with. Omitted means "tablet",
  // which is what every medicine created before this field existed is.
  form?: MedicineForm;
```

In `validate()`, add this check immediately after the `toOptionalString(input.company, "company");` line:

```ts
  // Undefined is the "not specified" case and defaults to tablet in
  // toFields(); anything else present must be a form we actually know.
  if (input.form !== undefined && !isMedicineForm(input.form)) {
    throw new Error("Medicine form thik nai");
  }
```

In `toFields()`, add after the `company` line:

```ts
    form: toMedicineForm(input.form),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/actions/medicines.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 6: Commit**

```bash
git add src/models/Medicine.ts src/actions/medicines.ts tests/actions/medicines.test.ts
git commit -m "feat: store a form on each medicine"
```

---

### Task 3: Make formatStock speak the medicine's language

`formatStock` gains a required third parameter, and every caller is updated to pass a real form. Required rather than defaulted so the compiler names each call site instead of letting one quietly keep saying "pata". This task changes several files at once because splitting it would leave the build broken in between.

**Files:**
- Modify: `src/lib/units.ts`
- Modify: `src/components/MedicineForm.tsx` (the `MedicineFormValues` type only)
- Modify: `src/components/MedicineTable.tsx`
- Modify: `src/components/MedicinePicker.tsx`
- Modify: `src/components/StockInForm.tsx` (the `formatStock` call only)
- Modify: `src/components/DashboardCards.tsx`
- Modify: `src/actions/dashboard.ts`
- Modify: `src/app/(admin)/medicines/page.tsx`
- Test: `tests/lib/units.test.ts`

**Interfaces:**
- Consumes: `unitLabelsFor`, `toMedicineForm`, `MedicineForm` from Task 1; `MedicineDoc.form` from Task 2.
- Produces:
  - `formatStock(stockPatas: number, patasPerBox: number, form: unknown): string`
  - `MedicineFormValues.form: MedicineForm`
  - `PickedMedicine.form: MedicineForm`
  - `LowStockRow.form: MedicineForm`

- [ ] **Step 1: Update the failing tests**

In `tests/lib/units.test.ts`, replace the whole `describe("formatStock", ...)` block with:

```ts
describe("formatStock", () => {
  it("shows boxes and patas together", () => {
    expect(formatStock(498, 10, "tablet")).toBe("49 box 8 pata");
  });

  it("omits patas when the split is exact", () => {
    expect(formatStock(500, 10, "tablet")).toBe("50 box");
  });

  it("omits boxes when under one box", () => {
    expect(formatStock(8, 10, "tablet")).toBe("8 pata");
  });

  it("shows empty stock as zero patas", () => {
    expect(formatStock(0, 10, "tablet")).toBe("0 pata");
  });

  it("uses each form's own words", () => {
    expect(formatStock(41, 12, "syrup")).toBe("3 carton 5 bottle");
    expect(formatStock(24, 12, "syrup")).toBe("2 carton");
    expect(formatStock(5, 12, "syrup")).toBe("5 bottle");
    expect(formatStock(7, 5, "injection")).toBe("1 box 2 vial");
    expect(formatStock(3, 6, "cream")).toBe("3 tube");
    expect(formatStock(6, 6, "drops")).toBe("1 box");
  });

  // Medicines saved before the form field existed read back without one.
  it("falls back to box/pata for a missing or unknown form", () => {
    expect(formatStock(498, 10, undefined)).toBe("49 box 8 pata");
    expect(formatStock(498, 10, "ointment")).toBe("49 box 8 pata");
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => formatStock(100, 0, "tablet")).toThrow("patasPerBox must be at least 1");
    expect(() => formatStock(100, -1, "tablet")).toThrow("patasPerBox must be at least 1");
  });

  it("rejects a non-integer patasPerBox", () => {
    expect(() => formatStock(100, 10.5, "tablet")).toThrow("patasPerBox must be a whole number");
  });

  it("rejects negative stockPatas", () => {
    expect(() => formatStock(-1, 10, "tablet")).toThrow("stockPatas cannot be negative");
  });

  it("rejects a non-integer stockPatas", () => {
    expect(() => formatStock(5.5, 10, "tablet")).toThrow("stockPatas must be a whole number");
  });

  it("rejects NaN and Infinity", () => {
    expect(() => formatStock(NaN, 10, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(Infinity, 10, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(100, NaN, "tablet")).toThrow("is not a valid number");
    expect(() => formatStock(100, Infinity, "tablet")).toThrow("is not a valid number");
  });

  // A bad number must be reported as a bad number, not silently formatted
  // with fallback wording, so the guards have to run before the labels.
  it("validates numbers before it looks at the form", () => {
    expect(() => formatStock(-1, 10, "definitely-not-a-form")).toThrow(
      "stockPatas cannot be negative",
    );
  });
});
```

In the same file, update the last line of the `describe("validation ordering consistency", ...)` block that calls `formatStock`:

```ts
    expect(() => formatStock(-1.5, 10, "tablet")).toThrow("stockPatas must be a whole number");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/units.test.ts`
Expected: FAIL on `formatStock(41, 12, "syrup")` — receives `"3 box 5 pata"`, expected `"3 carton 5 bottle"`.

- [ ] **Step 3: Update formatStock**

In `src/lib/units.ts`, add the import at the top of the file, above the block comment:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Replace the file's opening block comment with:

```ts
/**
 * Stock is stored as a single integer count of inner units — patas for a
 * tablet strip, bottles for a syrup. The owner enters and reads stock in outer
 * packs, so every pack quantity converts through here. Keeping one canonical
 * number means the two counts can never disagree.
 *
 * The field names say "pata" and "box" because that is what they were called
 * when the system only sold tablets; they mean "inner unit" and "outer pack"
 * under every medicine form. The words a person actually sees come from
 * src/lib/unitLabels.ts, never from these names.
 */
```

Replace `formatStock` with:

```ts
export function formatStock(
  stockPatas: number,
  patasPerBox: number,
  form: unknown,
): string {
  // splitStock validates first, so a bad number is reported as a bad number
  // rather than formatted with fallback wording.
  const { boxes, patas } = splitStock(stockPatas, patasPerBox);
  const labels = unitLabelsFor(form);
  if (boxes === 0) return `${patas} ${labels.inner}`;
  if (patas === 0) return `${boxes} ${labels.outer}`;
  return `${boxes} ${labels.outer} ${patas} ${labels.inner}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Carry the form to the four call sites**

**`src/components/MedicineForm.tsx`** — add the import and one field to the exported type. (The picker UI itself is Task 4; this step only makes the type carry the form.)

```ts
import { DEFAULT_MEDICINE_FORM, type MedicineForm } from "@/lib/unitLabels";
```

In `MedicineFormValues`, add after `company`:

```ts
  form: MedicineForm;
```

In the component body, add after the `company` state line:

```ts
  const [form, setForm] = useState<MedicineForm>(
    initial?.form ?? DEFAULT_MEDICINE_FORM,
  );
```

and add `form,` to the `medicineInput` object built in `handleSubmit`, right after `company,`. `setForm` has no caller until Task 4 wires up the picker; `tsconfig.json` does not set `noUnusedLocals`, so this does not fail the type-check.

**`src/app/(admin)/medicines/page.tsx`** — add the import and the mapped field:

```ts
import { toMedicineForm } from "@/lib/unitLabels";
```

In the `rows` mapping, add after `company: m.company,`:

```ts
    form: toMedicineForm(m.form),
```

**`src/components/MedicineTable.tsx`** — the `formatStock` call at line 102:

```tsx
                    {formatStock(row.stockPatas, row.patasPerBox, row.form)}
```

**`src/components/MedicinePicker.tsx`** — add the import:

```ts
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
```

Add to `PickedMedicine`, after `genericName`:

```ts
  form: MedicineForm;
```

Add to the object built inside `found.map`, after `genericName: m.genericName,`:

```ts
            form: toMedicineForm(m.form),
```

and update the `formatStock` call in the dropdown:

```tsx
                  {formatStock(medicine.stockPatas, medicine.patasPerBox, medicine.form)}
```

**`src/actions/dashboard.ts`** — add the import:

```ts
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
```

Add to `LowStockRow`, after `name`:

```ts
  form: MedicineForm;
```

and to the `lowStock` mapping, after `name: medicine.name,`:

```ts
      form: toMedicineForm(medicine.form),
```

**`src/components/DashboardCards.tsx`** — add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Replace the low-stock row body (the `<tr>` inside `summary.lowStock.map`) with:

```tsx
                {summary.lowStock.map((row) => (
                  <tr key={row.medicineId} className={trow}>
                    <td className={`${td} font-semibold`}>{row.name}</td>
                    <td className={`${td} font-semibold text-warn`}>
                      {formatStock(row.stockPatas, row.patasPerBox, row.form)}
                    </td>
                    <td className={`${td} text-muted`}>
                      {row.lowStockThreshold} {unitLabelsFor(row.form).inner}
                    </td>
                  </tr>
                ))}
```

**`src/components/StockInForm.tsx`** — only the `formatStock` call for now (the rest of this file is Task 5):

```tsx
              Ekhon ache: {formatStock(medicine.stockPatas, medicine.patasPerBox, medicine.form)}
```

- [ ] **Step 6: Verify the whole suite and the type-check**

Run: `npm test`
Expected: PASS, every file.

Run: `npx tsc --noEmit`
Expected: no errors. If it reports a `formatStock` call with 2 arguments, that call site was missed — fix it and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/lib/units.ts src/components/MedicineForm.tsx src/components/MedicineTable.tsx src/components/MedicinePicker.tsx src/components/StockInForm.tsx src/components/DashboardCards.tsx src/actions/dashboard.ts "src/app/(admin)/medicines/page.tsx" tests/lib/units.test.ts
git commit -m "feat: format stock in each medicine form's own units"
```

---

### Task 4: The form picker on the medicine screen

The reported bug. Adding a syrup must stop asking "1 box e koto pata".

**Files:**
- Modify: `src/components/MedicineForm.tsx`
- Modify: `src/components/MedicineTable.tsx`

**Interfaces:**
- Consumes: `MEDICINE_FORMS`, `unitLabelsFor`, `capitalize`, `toMedicineForm` from Task 1; `MedicineFormValues.form` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Add the picker and relabel the fields**

In `src/components/MedicineForm.tsx`, widen the import added in Task 3 to:

```ts
import {
  MEDICINE_FORMS,
  unitLabelsFor,
  toMedicineForm,
  capitalize,
  DEFAULT_MEDICINE_FORM,
  type MedicineForm,
} from "@/lib/unitLabels";
```

In the component body, add directly below the `form` state declaration:

```ts
  const labels = unitLabelsFor(form);
```

Insert this as the first child of the `<div className="grid gap-3.5 sm:grid-cols-2">`, before the "Nam" field:

```tsx
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="form" className={labelCls}>Medicine er dhoron</label>
          <select id="form" className={input} value={form}
            onChange={(e) => setForm(toMedicineForm(e.target.value))}>
            {MEDICINE_FORMS.map((option) => (
              <option key={option} value={option}>
                {unitLabelsFor(option).formLabel}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Ei medicine {labels.outer} ar {labels.inner} hishebe cholbe — shob
            screen e oi naam e dekhabe.
          </p>
        </div>
```

Replace the five hard-coded labels further down the same grid:

```tsx
          <label htmlFor="ppb" className={labelCls}>
            1 {labels.outer} e koto {labels.inner}
          </label>
```

```tsx
          <label htmlFor="boxPrice" className={labelCls}>
            {capitalize(labels.outer)} rate (৳) — wholesale
          </label>
```

```tsx
          <label htmlFor="mrp" className={labelCls}>
            MRP {labels.outer} rate (৳) — optional
          </label>
```

```tsx
          <p className="text-xs text-muted">
            {capitalize(labels.outer)} rate er cheye beshi dile buyer
            &ldquo;kata dam&rdquo; ar discount dekhbe.
          </p>
```

```tsx
          <label htmlFor="pataPrice" className={labelCls}>
            {capitalize(labels.inner)} rate (৳) — khuchra
          </label>
```

```tsx
          <label htmlFor="threshold" className={labelCls}>
            Stock kom alert ({labels.inner})
          </label>
```

- [ ] **Step 2: Relabel the medicine table**

`MedicineTable` shows many medicines at once, so its column headers cannot name one form's units — the per-row words go in the cells instead.

In `src/components/MedicineTable.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Replace the three headers:

```tsx
              <th className={th}>Pack</th>
              <th className={th}>Pack rate</th>
              <th className={th}>Khuchra rate</th>
```

Replace the pack cell (currently `{row.patasPerBox} pata`) so it names both units:

```tsx
                  <td className={`${td} text-muted`}>
                    {row.patasPerBox} {unitLabelsFor(row.form).inner}/
                    {unitLabelsFor(row.form).outer}
                  </td>
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Check it in the browser**

Run: `npm run dev`, open `/medicines`, click "+ Notun medicine".

Expected: a "Medicine er dhoron" dropdown appears first, defaulting to "Tablet / Capsule" with the old wording underneath. Selecting "Syrup / Suspension" changes the labels to "1 carton e koto bottle", "Carton rate (৳) — wholesale", "Bottle rate (৳) — khuchra", "Stock kom alert (bottle)". Save a syrup with 12 bottles per carton and confirm the table row reads "12 bottle/carton". Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/MedicineForm.tsx src/components/MedicineTable.tsx
git commit -m "feat: pick a medicine's form and label its fields to match"
```

---

### Task 5: Stock-in and the stock log

**Files:**
- Modify: `src/components/StockInForm.tsx`
- Modify: `src/models/StockEntry.ts`
- Modify: `src/actions/stock.ts`
- Modify: `src/app/(admin)/stock/page.tsx`

**Interfaces:**
- Consumes: `unitLabelsFor` from Task 1; `PickedMedicine.form` from Task 3.
- Produces: `StockEntryDoc.form: string`.

- [ ] **Step 1: Snapshot the form on the stock entry**

In `src/models/StockEntry.ts`, add to `stockEntrySchema` after `patasAdded`:

```ts
    // Snapshotted for the same reason patasAdded is: this row must keep
    // reading the way it did the day it was written, even if the medicine's
    // form is corrected later. No enum — a snapshot must not fail validation
    // over a value the medicine model no longer offers, and unitLabelsFor
    // renders anything unrecognised as tablet wording. See
    // src/lib/unitLabels.ts.
    form: { type: String, default: "tablet" },
```

In `src/actions/stock.ts`, inside the `StockEntryModel.create` call, add `form: medicine.form,` alongside `medicineName` and `patasAdded`.

- [ ] **Step 2: Relabel the stock-in form**

In `src/components/StockInForm.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Add at the top of the component body, after the `busy` state:

```ts
  // Safe before a medicine is picked: unitLabelsFor(undefined) is tablet
  // wording, and none of these labels renders until `medicine` is set.
  const labels = unitLabelsFor(medicine?.form);
```

In `handleSubmit`, replace the success line:

```ts
      setDone(`${medicine.name} — ${boxes} ${labels.outer} stock e dhuklo`);
```

Replace the "already have" line so it names the pack size in the right words:

```tsx
              Ekhon ache: {formatStock(medicine.stockPatas, medicine.patasPerBox, medicine.form)}
              {" · "}1 {labels.outer} = {medicine.patasPerBox} {labels.inner}
```

Replace the quantity label and its hint:

```tsx
            <label htmlFor="boxes" className={labelCls}>
              Koto {labels.outer} dhuklo
            </label>
```

```tsx
              <p className="text-xs text-muted">
                = {boxesToPatas(Number(boxes), medicine.patasPerBox)} {labels.inner}
              </p>
```

- [ ] **Step 3: Relabel the stock log table**

In `src/app/(admin)/stock/page.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

The table mixes forms, so the headers stay generic and the cells carry the words. Replace the two headers:

```tsx
                <th className="p-3">Pack</th>
                <th className="p-3">Unit</th>
```

Replace the two cells:

```tsx
                  <td className="p-3">
                    {entry.boxes} {unitLabelsFor(entry.form).outer}
                  </td>
                  <td className="p-3 text-muted">
                    {entry.patasAdded} {unitLabelsFor(entry.form).inner}
                  </td>
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS — `tests/actions/stock.test.ts` included.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/StockInForm.tsx src/models/StockEntry.ts src/actions/stock.ts "src/app/(admin)/stock/page.tsx"
git commit -m "feat: word stock-in and the stock log per medicine form"
```

---

### Task 6: The two sale forms

**Files:**
- Modify: `src/components/RetailSaleForm.tsx`
- Modify: `src/components/WholesaleSaleForm.tsx`

**Interfaces:**
- Consumes: `unitLabelsFor`, `capitalize` from Task 1; `PickedMedicine.form` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Retail — sells inner units**

In `src/components/RetailSaleForm.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

The cart mixes forms, so the "Pata" header becomes generic and each row names its own unit. Replace the header:

```tsx
                <th className={td}>Poriman</th>
```

Replace the rate cell:

```tsx
                  <td className={td}>
                    {formatTaka(line.medicine.pataPricePaisa)}/
                    {unitLabelsFor(line.medicine.form).inner}
                  </td>
```

Replace the stock hint beside the quantity input:

```tsx
                    <span className="ml-1 text-xs text-muted">
                      {unitLabelsFor(line.medicine.form).inner} / {line.medicine.stockPatas}
                    </span>
```

- [ ] **Step 2: Wholesale — sells outer packs**

In `src/components/WholesaleSaleForm.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Replace the two form-specific headers:

```tsx
                  <th className={td}>Pack rate</th>
                  <th className={td}>Poriman</th>
```

Replace the pack-size line under the medicine name:

```tsx
                      <div className="text-xs text-muted">
                        {line.medicine.patasPerBox}{" "}
                        {unitLabelsFor(line.medicine.form).inner}/
                        {unitLabelsFor(line.medicine.form).outer}
                      </div>
```

Add the unit next to the quantity input, replacing that `<td>`:

```tsx
                    <td className={td}>
                      <input
                        type="number"
                        min={1}
                        value={line.boxes}
                        onChange={(e) => updateBoxes(idx, e.target.value)}
                        className="w-20 rounded border border-line px-2 py-1 text-sm"
                      />
                      <span className="ml-1 text-xs text-muted">
                        {unitLabelsFor(line.medicine.form).outer}
                      </span>
                    </td>
```

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/RetailSaleForm.tsx src/components/WholesaleSaleForm.tsx
git commit -m "feat: word both sale forms per medicine form"
```

---

### Task 7: Sale lines snapshot their form, and the invoice prints it

**Files:**
- Modify: `src/models/Sale.ts`
- Modify: `src/lib/writeWholesaleSale.ts`
- Modify: `src/actions/sales.ts`
- Modify: `src/components/Invoice.tsx`
- Modify: `src/app/invoice/[id]/page.tsx`
- Test: `tests/actions/sales.test.ts`

**Interfaces:**
- Consumes: `unitLabelsFor` from Task 1; `MedicineDoc.form` from Task 2.
- Produces: `SaleLineDoc.form: string`; `InvoiceProps.items[].form?: string`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/actions/sales.test.ts`. This reuses that file's existing `makeMedicine` / `makeBuyer` helpers, its `MedicineModel` and `SaleModel` imports, and its `beforeEach` admin session — no new imports or fixtures are needed.

```ts
describe("sale lines snapshot the medicine form", () => {
  it("records the form on a retail line", async () => {
    const syrup = await makeMedicine({
      name: "Napa Syrup",
      form: "syrup",
      patasPerBox: 12,
    });

    const sale = await recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 3 }],
    });

    expect(sale.items[0].form).toBe("syrup");
    // The tier marker is untouched: it says which tier was sold, not what
    // that tier is called.
    expect(sale.items[0].unit).toBe("pata");
  });

  it("records the form on a wholesale line", async () => {
    const syrup = await makeMedicine({
      name: "Ace Syrup",
      form: "syrup",
      patasPerBox: 12,
    });
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: syrup._id, boxes: 2 }],
      discountPaisa: 0,
      paidPaisa: 0,
    });

    expect(sale.items[0].form).toBe("syrup");
    expect(sale.items[0].unit).toBe("box");
  });

  it("keeps the old form on a past sale after the medicine changes form", async () => {
    const syrup = await makeMedicine({
      name: "Napa Syrup Plus",
      form: "syrup",
      patasPerBox: 12,
    });
    const sale = await recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 1 }],
    });

    await MedicineModel.updateOne(
      { _id: syrup._id },
      { $set: { form: "tablet" } },
    );

    const reread = await SaleModel.findById(sale._id).lean();
    expect(reread?.items[0].form).toBe("syrup");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/actions/sales.test.ts`
Expected: FAIL — `expected undefined to be 'syrup'`.

- [ ] **Step 3: Add the field to the sale line**

In `src/models/Sale.ts`, add to `saleLineSchema` after `patasDeducted`:

```ts
    // Which unit words this line prints with, snapshotted for the same reason
    // medicineName and ratePaisa are: an invoice printed last month must not
    // re-word itself because the medicine's form was corrected today. The
    // form rather than a rendered label, because the invoice needs "btl"
    // while a screen needs "bottle" — both derive from this, neither derives
    // from the other. No enum: a snapshot must not fail validation over a
    // value the medicine model no longer offers. See src/lib/unitLabels.ts.
    form: { type: String, default: "tablet" },
```

- [ ] **Step 4: Write it from both sale paths**

In `src/lib/writeWholesaleSale.ts`, add `form: medicine.form,` to the object pushed onto `lines`, directly after `medicineName: medicine.name,`.

In `src/actions/sales.ts`, add `form: medicine.form,` to the object pushed onto `lines` in the retail branch, directly after `medicineName: medicine.name,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/actions/sales.test.ts`
Expected: PASS.

- [ ] **Step 6: Print the right abbreviation**

In `src/components/Invoice.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Add to the `items` element type in `InvoiceProps`, after `unit: string;`:

```ts
    // Absent on sales written before medicine forms existed; unitLabelsFor
    // renders those as the box/pata wording they were printed with.
    form?: string;
```

Replace the `items.map` body so each line derives its own abbreviation:

```tsx
          {items.map((item, idx) => {
            const labels = unitLabelsFor(item.form);
            return (
              <tr key={idx} className="border-b border-dashed border-slate-200">
                <td className="py-1 pr-1">{item.medicineName}</td>
                <td className="py-1 text-right">
                  {item.quantity}
                  {item.unit === "box" ? labels.outerShort : labels.innerShort}
                </td>
                <td className="py-1 text-right">{formatTaka(item.ratePaisa)}</td>
                <td className="py-1 text-right">{formatTaka(item.lineTotalPaisa)}</td>
              </tr>
            );
          })}
```

In `src/app/invoice/[id]/page.tsx`, add `form: item.form,` to the `items` mapping, after `unit: item.unit,`.

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/models/Sale.ts src/lib/writeWholesaleSale.ts src/actions/sales.ts src/components/Invoice.tsx "src/app/invoice/[id]/page.tsx" tests/actions/sales.test.ts
git commit -m "feat: snapshot the medicine form on sale lines and print it"
```

---

### Task 8: The buyer storefront

**Files:**
- Modify: `src/actions/buyerOrders.ts`
- Modify: `src/components/BuyerBrowse.tsx`
- Test: `tests/actions/buyerOrders.test.ts`

**Interfaces:**
- Consumes: `unitLabelsFor`, `toMedicineForm`, `capitalize`, `MedicineForm` from Task 1.
- Produces: `BuyerMedicineOption.form: MedicineForm`.

- [ ] **Step 1: Write the failing test**

Add to `tests/actions/buyerOrders.test.ts`, inside the existing `describe("searchMedicinesForBuyer", ...)` block (around line 311). It reuses that file's `makeMedicine` helper and the file-wide `beforeEach` that signs a buyer session — no new imports or fixtures.

```ts
  it("returns the medicine form, and still no stock count or retail price", async () => {
    await makeMedicine({ name: "Napa Syrup", form: "syrup", patasPerBox: 12 });

    const [found] = await searchMedicinesForBuyer("Napa Syrup");

    expect(found.form).toBe("syrup");
    // The domain rule this endpoint exists to enforce: a buyer never sees
    // the raw stock count or the retail price. A form name is neither.
    expect(found).not.toHaveProperty("stockPatas");
    expect(found).not.toHaveProperty("pataPricePaisa");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/actions/buyerOrders.test.ts`
Expected: FAIL — `expected undefined to be 'syrup'`.

- [ ] **Step 3: Return the form from the buyer search**

In `src/actions/buyerOrders.ts`, add the import:

```ts
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
```

Add to `BuyerMedicineOption`, after `company`:

```ts
  // Which unit words to show. Not sensitive: it is neither the stock count
  // nor the retail price.
  form: MedicineForm;
```

In `searchMedicinesForBuyer`, add `form` to the projection:

```ts
    .select("name company form boxPricePaisa mrpBoxPricePaisa stockPatas lowStockThreshold")
```

add `form?: string;` to the `.lean<...>()` shape, after `company: string;`, and add to the returned object after `company: m.company,`:

```ts
    form: toMedicineForm(m.form),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/actions/buyerOrders.test.ts`
Expected: PASS.

- [ ] **Step 5: Word the storefront**

In `src/components/BuyerBrowse.tsx`, add the import:

```ts
import { unitLabelsFor, capitalize } from "@/lib/unitLabels";
```

In the cart line, replace the price line:

```tsx
                <div className="text-xs text-muted">
                  {formatTaka(line.medicine.boxPricePaisa)}/
                  {unitLabelsFor(line.medicine.form).outer} ·{" "}
                  <span className="font-semibold text-brand-strong">
                    {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
                  </span>
                </div>
```

and pass the unit word to the stepper:

```tsx
              <Stepper
                value={line.boxes}
                onChange={(v) => setBoxes(line.medicine.id, v)}
                unitLabel={unitLabelsFor(line.medicine.form).outer}
              />
```

In `ProductCard`, replace the `/box` suffix:

```tsx
          <span className="text-[11px] text-muted">
            /{unitLabelsFor(medicine.form).outer}
          </span>
```

In the `Stepper` component, accept and use the label so the screen-reader name matches what is being counted:

```tsx
function Stepper({
  value,
  onChange,
  unitLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  unitLabel: string;
}) {
```

and replace the input's `aria-label`:

```tsx
        aria-label={capitalize(unitLabel)}
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/actions/buyerOrders.ts src/components/BuyerBrowse.tsx tests/actions/buyerOrders.test.ts
git commit -m "feat: word the buyer storefront per medicine form"
```

---

### Task 9: Order lines snapshot their form, and both order screens read it

The last two screens still saying "box".

**Files:**
- Modify: `src/models/Order.ts`
- Modify: `src/actions/buyerOrders.ts`
- Modify: `src/components/PendingOrders.tsx`
- Modify: `src/components/BuyerOrderList.tsx`
- Modify: `src/app/(admin)/orders/page.tsx`
- Modify: `src/app/(buyer)/buyer/orders/page.tsx`
- Test: `tests/actions/buyerOrders.test.ts`

**Interfaces:**
- Consumes: `unitLabelsFor` from Task 1; `MedicineDoc.form` from Task 2.
- Produces: `OrderLineDoc.form: string`; `PendingOrderRow.items[].form: string`; `OrderRow.items[].form: string`.

- [ ] **Step 1: Write the failing test**

Add to `tests/actions/buyerOrders.test.ts`, inside the existing `describe("submitOrder", ...)` block (around line 71). It reuses that file's `makeSessionBuyer` and `makeMedicine` helpers.

```ts
  it("snapshots the medicine form on each order line", async () => {
    await makeSessionBuyer();
    const syrup = await makeMedicine({
      name: "Ace Syrup",
      form: "syrup",
      patasPerBox: 12,
    });

    const order = await submitOrder([
      { medicineId: String(syrup._id), boxes: 2 },
    ]);

    expect(order.items[0].form).toBe("syrup");
  });

  it("defaults an order line to tablet for a medicine saved before forms existed", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    // Strip the field the way a document written before this change looks.
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $unset: { form: "" } },
    );

    const order = await submitOrder([
      { medicineId: String(medicine._id), boxes: 1 },
    ]);

    expect(order.items[0].form).toBe("tablet");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/actions/buyerOrders.test.ts`
Expected: FAIL — `expected undefined to be 'syrup'`.

- [ ] **Step 3: Add the field and write it**

In `src/models/Order.ts`, add to `orderLineSchema` after `boxPricePaisa`:

```ts
    // Which unit words this line reads with, snapshotted like medicineName
    // and boxPricePaisa above so a pending order does not silently re-word
    // itself if the medicine's form is corrected before approval. No enum,
    // for the same reason as the sale line. See src/lib/unitLabels.ts.
    form: { type: String, default: "tablet" },
```

In `src/actions/buyerOrders.ts`, in `submitOrder`, add `form: medicine.form,` to the object pushed onto `lines`, after `medicineName: medicine.name,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/actions/buyerOrders.test.ts`
Expected: PASS.

- [ ] **Step 5: Word the owner's pending-order screen**

In `src/app/(admin)/orders/page.tsx`, add `form: i.form,` to the returned item object inside `o.items.map`, after `medicineName: i.medicineName,`.

In `src/components/PendingOrders.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Add `form: string;` to the `items` element type in `PendingOrderRow`, after `medicineName: string;`.

An order can mix forms, so the headers stay generic. Replace the header row:

```tsx
                <tr>
                  <th className="py-1">Medicine</th>
                  <th className="py-1">Pack rate</th>
                  <th className="py-1">Order</th>
                  <th className="py-1">Approve koto</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
```

Replace the body of `order.items.map` so each row names its own unit:

```tsx
                {order.items.map((item) => {
                  const boxes = edits[order.id]?.[item.medicineId] ?? item.boxes;
                  const labels = unitLabelsFor(item.form);
                  return (
                    <tr key={item.medicineId} className="border-t border-line">
                      <td className="py-2 font-medium text-ink">{item.medicineName}</td>
                      <td className="py-2">{formatTaka(item.boxPricePaisa)}</td>
                      <td className="py-2 text-muted">
                        {item.boxes} {labels.outer}
                      </td>
                      <td className="py-2">
                        <input type="number" min={0} value={boxes}
                          onChange={(e) => setBoxes(order.id, item.medicineId, Number(e.target.value))}
                          className="w-20 rounded-lg border border-line px-2 py-1" />
                        <span className="ml-1 text-xs text-muted">{labels.outer}</span>
                      </td>
                      <td className="py-2 text-right">{formatTaka(item.boxPricePaisa * boxes)}</td>
                    </tr>
                  );
                })}
```

- [ ] **Step 6: Word the buyer's order history**

In `src/app/(buyer)/buyer/orders/page.tsx`, add `form: i.form,` to the mapped item object, after `medicineName: i.medicineName,`.

In `src/components/BuyerOrderList.tsx`, add the import:

```ts
import { unitLabelsFor } from "@/lib/unitLabels";
```

Add `form: string;` to the `items` element type in `OrderRow`, after `medicineName: string;`.

Replace the quantity span in the item list:

```tsx
                    <span className="text-muted">
                      × {item.boxes} {unitLabelsFor(item.form).outer}
                    </span>
```

- [ ] **Step 7: Verify the whole feature**

Run: `npm test`
Expected: PASS, every file.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

Then confirm nothing still hard-codes a unit word:

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.next -iE '"[^"]*\b(pata|box)\b[^"]*"|>[^<]*\b(pata|box)\b[^<]*<' src | grep -viE 'unitLabels|patasPerBox|stockPatas|pataPrice|boxPrice|patasDeducted|patasAdded|box-|boxShadow|content-box|box tree'
```
Expected: only comments and the `unit: { enum: ["box", "pata"] }` tier marker in `src/models/Sale.ts`, plus `unit === "box"` in `Invoice.tsx`. Any user-facing string that comes back is a miss — fix it.

- [ ] **Step 8: Commit**

```bash
git add src/models/Order.ts src/actions/buyerOrders.ts src/components/PendingOrders.tsx src/components/BuyerOrderList.tsx "src/app/(admin)/orders/page.tsx" "src/app/(buyer)/buyer/orders/page.tsx" tests/actions/buyerOrders.test.ts
git commit -m "feat: snapshot the medicine form on order lines and read it on both order screens"
```

---

## Done when

- A syrup is added with a "Syrup / Suspension" form and the add screen asks "1 carton e koto bottle".
- Stock-in, the medicine table, the dashboard low-stock list, both sale forms, both order screens, the buyer storefront, and the printed invoice all use that medicine's own words.
- Every medicine created before this change still reads as box/pata, with no migration run.
- `npm test`, `npx tsc --noEmit`, and `npm run build` all pass.
