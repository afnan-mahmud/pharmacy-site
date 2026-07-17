# ABC Pharmacy — Reports & Dashboard Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner see what the pharmacy sold over any date range, and open the software to a dashboard that tells him the state of his business at a glance.

**Architecture:** Read-only aggregations over the `Sale`, `Payment`, and `Medicine` collections that Plans 1-2 already fill. All date arithmetic goes through one pure `Asia/Dhaka` module so "today" means the owner's today, not UTC's. No new models, no writes.

**Tech Stack:** Next.js (App Router, TypeScript), MongoDB Atlas, Mongoose, Tailwind CSS, Vitest, mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-07-16-pharmacy-management-design.md`
**Builds on:** Plans 1 and 2 (both complete)

## Global Constraints

Copied from the spec and Plans 1-2. Every task's requirements implicitly include these.

- **Money is stored as integer paisa, never floats.** 1 taka = 100 paisa. Conversion happens only at the UI boundary via `src/lib/money.ts` (`takaToPaisa`, `paisaToTaka`, `formatTaka`). `formatTaka(-1250)` returns `"-৳12.50"` — the sign sits before the symbol.
- **Stock is stored as integer patas, never boxes.** Display via `formatStock(stockPatas, patasPerBox)` from `src/lib/units.ts` — "49 box 8 pata".
- **Every new server action must call `requireAdminAction()` as its first statement.** Server actions are independently-callable POST endpoints whose IDs ship in the public client bundle; a guard in a layout does not protect them. `tests/actions/authorization.test.ts` discovers action exports automatically and will fail on any unguarded new action.
- **Timezone: `Asia/Dhaka` for all date display and "today" calculations.** The owner's day starts at midnight in Dhaka, which is 18:00 UTC the previous day. A report that silently uses UTC days would put the evening's sales on the wrong date.
- **Pharmacy name is never hardcoded.** `"ABC Pharmacy"` exists only as the schema default in `src/models/Settings.ts`.
- **Currency symbol:** `৳` — the Taka sign.
- **User-facing strings are Banglish** — Bengali written in **Latin letters only** ("Aj ker bikri", "Mot baki", "Stock kom"). Never Bengali script. `৳` is a currency symbol and is exempt.
- **Actions validate every input at the trust boundary**, following the convention in `src/actions/medicines.ts`. Clean domain errors, never raw CastErrors.
- **A cancelled sale is excluded from every total but still visible in every list.** The books show what happened, not a tidied version. This is the rule `buyerLedger` and `listBuyerDues` already follow.
- **A buyer's balance is signed.** Positive means the buyer owes the pharmacy (`Baki`). Negative means the pharmacy owes the buyer (`Joma ache` — credit from a cancelled sale he had already paid for). Never render "Baki -৳1200".
- **Tests must pass before every commit.** Suite is currently 323 passed / 3 skipped across 20 files.

## Existing interfaces this plan consumes

Read these before starting; do not modify them.

- `src/lib/money.ts` — `takaToPaisa(taka: string | number): number`, `paisaToTaka(paisa: number): number`, `formatTaka(paisa: number): string`
- `src/lib/units.ts` — `boxesToPatas`, `splitStock`, `formatStock(stockPatas, patasPerBox): string`
- `src/lib/serialize.ts` — `toPlain`, `toPlainList`, `type Serialized<T>`
- `src/lib/session.ts` — `requireAdminAction(): Promise<SessionPayload>`, `ADMIN_ONLY_ERROR`
- `src/lib/db.ts` — `connectDb()`
- `src/models/Sale.ts` — `SaleModel`, `SaleDoc`. Fields: `type` (`"retail" | "wholesale"`), `buyerId`, `buyerName`, `buyerShopName`, `invoiceNo`, `items[]`, `subtotalPaisa`, `discountPaisa`, `totalPaisa`, `paidPaisa`, `duePaisa`, `status` (`"active" | "cancelled"`), `createdAt`
- `src/models/Medicine.ts` — `MedicineModel`, `MedicineDoc`. Fields: `name`, `stockPatas`, `patasPerBox`, `lowStockThreshold`, `active`
- `src/actions/due.ts` — `listBuyerDues(): Promise<DueRow[]>` where `DueRow = { buyerId: string; buyerName: string; buyerShopName: string; duePaisa: number }`. **`duePaisa` is signed**: positive = the buyer owes, negative = the pharmacy owes him credit.
- `src/lib/dueDisplay.ts` — `describeDue(duePaisa: number): { label: "Baki" | "Joma ache" | "Baki nei"; amountText: string; className: string }`. **Every surface that renders a single signed balance must go through this**, so the label and the amount can never disagree. A review found that "Baki ৳-1200.00" reads as nonsense to a pharmacist; this helper is what stops any new UI reintroducing it.
- `tests/helpers/db.ts` — `setupTestDb()`. Call at the top level of a test file: it starts an in-memory replica set, builds real indexes, cleans between tests, and seeds the connection cache so actions' `connectDb()` works. No other setup needed.
- `tests/helpers/auth.ts` — `createMockCookieStore()`, `setSessionCookie(store, token)`, `clearSessionCookie(store)`, `adminToken()`, `buyerToken()`. See `tests/actions/medicines.test.ts` for the `vi.mock("next/headers")` shape every action test uses; follow it exactly.

---

### Task 1: Asia/Dhaka date boundaries

Pure date arithmetic, no database. Every report and "today" calculation goes through this, so the owner's evening sales land on the owner's date.

**Files:**
- Create: `src/lib/dhakaDate.ts`
- Test: `tests/lib/dhakaDate.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `dhakaToday(now?: Date): string` — the current Dhaka calendar date as `"YYYY-MM-DD"`
  - `dhakaDayBounds(dhakaDate: string): { start: Date; end: Date }` — the UTC instants bounding that Dhaka day; `start` inclusive, `end` exclusive
  - `dhakaRangeBounds(fromDate: string, toDate: string): { start: Date; end: Date }` — start of `fromDate` to end of `toDate`, inclusive of both days
  - `formatDhakaDate(value: Date | string): string` — `"17/07/2026"`
  - `formatDhakaDateTime(value: Date | string): string` — `"17/07/2026, 22:30"`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/dhakaDate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  dhakaToday,
  dhakaDayBounds,
  dhakaRangeBounds,
  formatDhakaDate,
  formatDhakaDateTime,
} from "@/lib/dhakaDate";

describe("dhakaToday", () => {
  it("returns the Dhaka date, not the UTC date", () => {
    // 22:30 UTC on the 16th is already 04:30 on the 17th in Dhaka (UTC+6).
    // A UTC-based "today" would report the 16th and file the owner's late
    // evening sales under yesterday.
    expect(dhakaToday(new Date("2026-07-16T22:30:00Z"))).toBe("2026-07-17");
  });

  it("still reports the previous day just before Dhaka midnight", () => {
    // 17:59 UTC is 23:59 in Dhaka on the same date.
    expect(dhakaToday(new Date("2026-07-17T17:59:00Z"))).toBe("2026-07-17");
  });

  it("rolls over exactly at Dhaka midnight", () => {
    // 18:00 UTC is 00:00 the next day in Dhaka.
    expect(dhakaToday(new Date("2026-07-17T18:00:00Z"))).toBe("2026-07-18");
  });

  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(dhakaToday(new Date("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });
});

describe("dhakaDayBounds", () => {
  it("starts at Dhaka midnight, which is 18:00 UTC the previous day", () => {
    const { start } = dhakaDayBounds("2026-07-17");
    expect(start.toISOString()).toBe("2026-07-16T18:00:00.000Z");
  });

  it("ends at the next Dhaka midnight, exclusive", () => {
    const { end } = dhakaDayBounds("2026-07-17");
    expect(end.toISOString()).toBe("2026-07-17T18:00:00.000Z");
  });

  it("spans exactly 24 hours", () => {
    const { start, end } = dhakaDayBounds("2026-07-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("brackets a sale made late in the Dhaka evening", () => {
    // 22:30 Dhaka on the 17th = 16:30 UTC on the 17th.
    const sale = new Date("2026-07-17T16:30:00Z");
    const { start, end } = dhakaDayBounds("2026-07-17");
    expect(sale >= start && sale < end).toBe(true);
  });

  it("excludes a sale made just after Dhaka midnight", () => {
    // 00:30 Dhaka on the 18th = 18:30 UTC on the 17th.
    const sale = new Date("2026-07-17T18:30:00Z");
    const { end } = dhakaDayBounds("2026-07-17");
    expect(sale < end).toBe(false);
  });

  it("handles a month boundary", () => {
    const { start } = dhakaDayBounds("2026-08-01");
    expect(start.toISOString()).toBe("2026-07-31T18:00:00.000Z");
  });

  it("rejects a malformed date", () => {
    expect(() => dhakaDayBounds("17-07-2026")).toThrow("Date ta YYYY-MM-DD hote hobe");
    expect(() => dhakaDayBounds("")).toThrow("Date ta YYYY-MM-DD hote hobe");
    expect(() => dhakaDayBounds("2026-13-01")).toThrow("Date ta thik na");
  });
});

describe("dhakaRangeBounds", () => {
  it("covers both end days completely", () => {
    const { start, end } = dhakaRangeBounds("2026-07-01", "2026-07-31");
    expect(start.toISOString()).toBe("2026-06-30T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-31T18:00:00.000Z");
  });

  it("handles a single-day range", () => {
    const { start, end } = dhakaRangeBounds("2026-07-17", "2026-07-17");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("rejects a reversed range", () => {
    expect(() => dhakaRangeBounds("2026-07-31", "2026-07-01")).toThrow(
      "Sesh date ta shuru date er age hote parbe na",
    );
  });
});

describe("formatDhakaDate", () => {
  it("formats a UTC instant as its Dhaka calendar date", () => {
    expect(formatDhakaDate(new Date("2026-07-16T22:30:00Z"))).toBe("17/07/2026");
  });

  it("accepts an ISO string", () => {
    expect(formatDhakaDate("2026-07-16T22:30:00Z")).toBe("17/07/2026");
  });
});

describe("formatDhakaDateTime", () => {
  it("includes the Dhaka wall-clock time", () => {
    // 16:30 UTC is 22:30 in Dhaka.
    expect(formatDhakaDateTime(new Date("2026-07-17T16:30:00Z"))).toBe(
      "17/07/2026, 22:30",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/dhakaDate.test.ts`
Expected: FAIL — cannot resolve `@/lib/dhakaDate`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/dhakaDate.ts`:

```typescript
/**
 * Every date the owner sees, and every "today" the system computes, is a
 * Dhaka date — not a UTC one. Bangladesh is UTC+6 and does not observe DST
 * (it was tried once, in 2009, and abandoned), so the offset is a constant.
 *
 * This matters concretely: a sale rung up at 22:30 Dhaka time is stored as
 * 16:30 UTC the same day, but one at 00:30 Dhaka is stored as 18:30 UTC the
 * *previous* day. A report that bucketed by UTC day would scatter an
 * evening's takings across two dates and quietly disagree with the cash
 * drawer.
 */

const DHAKA_UTC_OFFSET = "+06:00";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertDhakaDate(dhakaDate: string): void {
  if (typeof dhakaDate !== "string" || !ISO_DATE.test(dhakaDate)) {
    throw new Error("Date ta YYYY-MM-DD hote hobe");
  }
  // The regex admits shapes like 2026-13-01; only Date can say whether the
  // calendar actually contains that day.
  if (Number.isNaN(Date.parse(`${dhakaDate}T00:00:00${DHAKA_UTC_OFFSET}`))) {
    throw new Error("Date ta thik na");
  }
}

/** The current Dhaka calendar date, as "YYYY-MM-DD". */
export function dhakaToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD, and asking Intl for the Dhaka zone keeps
  // this correct even if the tz database ever changes under us.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

/**
 * The UTC instants bounding a Dhaka day: `start` inclusive, `end` exclusive.
 * Query with `{ createdAt: { $gte: start, $lt: end } }`.
 */
export function dhakaDayBounds(dhakaDate: string): { start: Date; end: Date } {
  assertDhakaDate(dhakaDate);

  const start = new Date(`${dhakaDate}T00:00:00.000${DHAKA_UTC_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Start of `fromDate` to end of `toDate`, with both days included. */
export function dhakaRangeBounds(
  fromDate: string,
  toDate: string,
): { start: Date; end: Date } {
  const { start } = dhakaDayBounds(fromDate);
  const { end } = dhakaDayBounds(toDate);

  if (end.getTime() <= start.getTime()) {
    throw new Error("Sesh date ta shuru date er age hote parbe na");
  }
  return { start, end };
}

export function formatDhakaDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Asia/Dhaka",
  });
}

export function formatDhakaDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/dhakaDate.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dhakaDate.ts tests/lib/dhakaDate.test.ts
git commit -m "feat: add Asia/Dhaka date boundary helpers"
```

---

### Task 2: Sales report action

**Files:**
- Create: `src/actions/reports.ts`
- Test: `tests/actions/reports.test.ts`

**Interfaces:**
- Consumes: `dhakaRangeBounds` (Task 1), `requireAdminAction`, `connectDb`, `SaleModel`
- Produces:
  - `type SalesReportRow = { saleId: string; createdAt: string; type: "retail" | "wholesale"; invoiceNo: string | null; buyerName: string; totalPaisa: number; paidPaisa: number; duePaisa: number; cancelled: boolean }`
  - `type SalesReportTotals = { count: number; totalPaisa: number }`
  - `type SalesReport = { fromDate: string; toDate: string; rows: SalesReportRow[]; retail: SalesReportTotals; wholesale: SalesReportTotals & { duePaisa: number }; grandTotalPaisa: number; cancelledCount: number }`
  - `salesReport(fromDate: string, toDate: string): Promise<SalesReport>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/reports.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { salesReport } from "@/actions/reports";
import { SaleModel } from "@/models/Sale";
import mongoose from "mongoose";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

const ADMIN_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

/**
 * Writes a Sale directly. The report is a read-only aggregation, so driving
 * it through recordRetailSale/recordWholesaleSale would only add stock
 * bookkeeping this test does not care about — and would make it impossible
 * to place a sale at a chosen instant.
 */
async function makeSale(overrides: Record<string, unknown> = {}) {
  const base = {
    type: "retail",
    buyerId: null,
    buyerName: "",
    buyerShopName: "",
    invoiceNo: null,
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        unit: "pata",
        quantity: 2,
        ratePaisa: 1400,
        lineTotalPaisa: 2800,
        patasDeducted: 2,
      },
    ],
    subtotalPaisa: 2800,
    discountPaisa: 0,
    totalPaisa: 2800,
    paidPaisa: 2800,
    duePaisa: 0,
    status: "active",
    createdBy: ADMIN_ID,
  };
  const sale = await SaleModel.create({ ...base, ...overrides });
  // createdAt is set by timestamps; override it when the test needs the sale
  // to sit at a specific instant.
  if (overrides.createdAt) {
    await SaleModel.updateOne(
      { _id: sale._id },
      { $set: { createdAt: overrides.createdAt } },
      { timestamps: false },
    );
  }
  return sale;
}

describe("salesReport", () => {
  it("returns an empty report when there are no sales", async () => {
    const report = await salesReport("2026-07-01", "2026-07-31");
    expect(report.rows).toEqual([]);
    expect(report.grandTotalPaisa).toBe(0);
    expect(report.retail).toEqual({ count: 0, totalPaisa: 0 });
    expect(report.wholesale).toEqual({ count: 0, totalPaisa: 0, duePaisa: 0 });
  });

  it("includes a sale inside the range", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
    expect(report.grandTotalPaisa).toBe(2800);
  });

  it("excludes a sale before the range", async () => {
    await makeSale({ createdAt: new Date("2026-07-16T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(0);
  });

  it("excludes a sale after the range", async () => {
    await makeSale({ createdAt: new Date("2026-07-19T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-18");
    expect(report.rows).toHaveLength(0);
  });

  it("includes a late-evening Dhaka sale on the right day", async () => {
    // 22:30 Dhaka on the 17th is 16:30 UTC on the 17th. A UTC-day report
    // would still catch this one; the next test is the one that matters.
    await makeSale({ createdAt: new Date("2026-07-17T16:30:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
  });

  it("files a post-Dhaka-midnight sale on the new day, not the old one", async () => {
    // 00:30 Dhaka on the 18th is 18:30 UTC on the 17th. Bucketing by UTC day
    // would wrongly report this as the 17th's takings.
    await makeSale({ createdAt: new Date("2026-07-17T18:30:00Z") });

    expect((await salesReport("2026-07-17", "2026-07-17")).rows).toHaveLength(0);
    expect((await salesReport("2026-07-18", "2026-07-18")).rows).toHaveLength(1);
  });

  it("splits retail and wholesale totals", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    await makeSale({
      type: "wholesale",
      invoiceNo: "ABC-000001",
      buyerName: "Karim Uddin",
      totalPaisa: 36000,
      subtotalPaisa: 36000,
      paidPaisa: 20000,
      duePaisa: 16000,
      createdAt: new Date("2026-07-17T11:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.retail).toEqual({ count: 1, totalPaisa: 2800 });
    expect(report.wholesale).toEqual({
      count: 1,
      totalPaisa: 36000,
      duePaisa: 16000,
    });
    expect(report.grandTotalPaisa).toBe(38800);
  });

  it("excludes a cancelled sale from every total", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    await makeSale({
      status: "cancelled",
      cancelledAt: new Date("2026-07-17T12:00:00Z"),
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T11:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.retail).toEqual({ count: 1, totalPaisa: 2800 });
    expect(report.grandTotalPaisa).toBe(2800);
  });

  it("still lists a cancelled sale, marked", async () => {
    // The books show what happened, not a tidied version — the same rule
    // buyerLedger follows.
    await makeSale({
      status: "cancelled",
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T11:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].cancelled).toBe(true);
    expect(report.cancelledCount).toBe(1);
  });

  it("returns rows newest first", async () => {
    await makeSale({
      totalPaisa: 100,
      createdAt: new Date("2026-07-17T10:00:00Z"),
    });
    await makeSale({
      totalPaisa: 200,
      createdAt: new Date("2026-07-17T12:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows.map((r) => r.totalPaisa)).toEqual([200, 100]);
  });

  it("carries the invoice number and buyer for a wholesale row", async () => {
    await makeSale({
      type: "wholesale",
      invoiceNo: "ABC-000041",
      buyerName: "Karim Uddin",
      createdAt: new Date("2026-07-17T10:00:00Z"),
    });

    const report = await salesReport("2026-07-17", "2026-07-17");
    expect(report.rows[0].invoiceNo).toBe("ABC-000041");
    expect(report.rows[0].buyerName).toBe("Karim Uddin");
  });

  it("echoes back the requested range", async () => {
    const report = await salesReport("2026-07-01", "2026-07-31");
    expect(report.fromDate).toBe("2026-07-01");
    expect(report.toDate).toBe("2026-07-31");
  });

  it("spans a multi-day range inclusively", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T10:00:00Z") });
    await makeSale({ createdAt: new Date("2026-07-19T10:00:00Z") });
    const report = await salesReport("2026-07-17", "2026-07-19");
    expect(report.rows).toHaveLength(2);
  });

  it("rejects a malformed date", async () => {
    await expect(salesReport("17-07-2026", "2026-07-17")).rejects.toThrow(
      "Date ta YYYY-MM-DD hote hobe",
    );
  });

  it("rejects a reversed range", async () => {
    await expect(salesReport("2026-07-31", "2026-07-01")).rejects.toThrow(
      "Sesh date ta shuru date er age hote parbe na",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(salesReport("2026-07-01", "2026-07-31")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });

  it("rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(salesReport("2026-07-01", "2026-07-31")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/reports.test.ts`
Expected: FAIL — cannot resolve `@/actions/reports`.

- [ ] **Step 3: Write the action**

Create `src/actions/reports.ts`:

```typescript
"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaRangeBounds } from "@/lib/dhakaDate";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type SalesReportRow = {
  saleId: string;
  createdAt: string;
  type: "retail" | "wholesale";
  invoiceNo: string | null;
  buyerName: string;
  totalPaisa: number;
  paidPaisa: number;
  duePaisa: number;
  cancelled: boolean;
};

export type SalesReportTotals = {
  count: number;
  totalPaisa: number;
};

export type SalesReport = {
  fromDate: string;
  toDate: string;
  rows: SalesReportRow[];
  retail: SalesReportTotals;
  wholesale: SalesReportTotals & { duePaisa: number };
  grandTotalPaisa: number;
  cancelledCount: number;
};

/**
 * Sales in a Dhaka date range, with retail and wholesale totalled separately.
 *
 * Cancelled sales are listed but excluded from every total — the same rule
 * buyerLedger and listBuyerDues follow. A report that hid them would make a
 * cancellation look like a sale that never happened; one that counted them
 * would overstate the day's takings.
 *
 * The range is bounded by Dhaka midnights, not UTC ones. See
 * src/lib/dhakaDate.ts for why that distinction is load-bearing.
 */
export async function salesReport(
  fromDate: string,
  toDate: string,
): Promise<SalesReport> {
  await requireAdminAction();
  await connectDb();

  // Throws a clean domain error on a malformed or reversed range.
  const { start, end } = dhakaRangeBounds(fromDate, toDate);

  const sales = await SaleModel.find({
    createdAt: { $gte: start, $lt: end },
  })
    .sort({ createdAt: -1 })
    .lean<SaleDoc[]>();

  const rows: SalesReportRow[] = sales.map((sale) => ({
    saleId: sale._id.toString(),
    createdAt: sale.createdAt.toISOString(),
    type: sale.type as "retail" | "wholesale",
    invoiceNo: sale.invoiceNo ?? null,
    buyerName: sale.buyerName,
    totalPaisa: sale.totalPaisa,
    paidPaisa: sale.paidPaisa,
    duePaisa: sale.duePaisa,
    cancelled: sale.status === "cancelled",
  }));

  const active = rows.filter((row) => !row.cancelled);
  const retailRows = active.filter((row) => row.type === "retail");
  const wholesaleRows = active.filter((row) => row.type === "wholesale");

  const sum = (list: SalesReportRow[], field: "totalPaisa" | "duePaisa") =>
    list.reduce((total, row) => total + row[field], 0);

  const retail: SalesReportTotals = {
    count: retailRows.length,
    totalPaisa: sum(retailRows, "totalPaisa"),
  };
  const wholesale = {
    count: wholesaleRows.length,
    totalPaisa: sum(wholesaleRows, "totalPaisa"),
    duePaisa: sum(wholesaleRows, "duePaisa"),
  };

  return {
    fromDate,
    toDate,
    rows,
    retail,
    wholesale,
    grandTotalPaisa: retail.totalPaisa + wholesale.totalPaisa,
    cancelledCount: rows.length - active.length,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/reports.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `tests/actions/authorization.test.ts` discovers the new module automatically and should pass, since `salesReport` calls `requireAdminAction()` first.

- [ ] **Step 6: Commit**

```bash
git add src/actions/reports.ts tests/actions/reports.test.ts
git commit -m "feat: add sales report action with Dhaka date ranges"
```

---

### Task 3: Report screen

**Files:**
- Create: `src/app/(admin)/reports/page.tsx`
- Create: `src/components/ReportView.tsx`
- Modify: `src/components/AdminNav.tsx`

**Interfaces:**
- Consumes: `salesReport`, `SalesReport` (Task 2), `dhakaToday` (Task 1), `formatTaka`, `formatDhakaDateTime`
- Produces: a working `/reports` screen and a nav link to it

- [ ] **Step 1: Write the view**

Create `src/components/ReportView.tsx`. Follow the error-handling convention in `src/components/MedicineForm.tsx` — read it first: a `role="alert"` red-text region, the Banglish fallback `"Kichu ekta bhul holo"`, and a `busy` state disabling submit.

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { salesReport, type SalesReport } from "@/actions/reports";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";

export function ReportView({
  initialReport,
  today,
}: {
  initialReport: SalesReport;
  today: string;
}) {
  const [report, setReport] = useState(initialReport);
  const [fromDate, setFromDate] = useState(initialReport.fromDate);
  const [toDate, setToDate] = useState(initialReport.toDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setReport(await salesReport(fromDate, toDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  function setRange(from: string, to: string) {
    setFromDate(from);
    setToDate(to);
  }

  const field = "rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Report</h1>

      <form onSubmit={handleSubmit} className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="fromDate" className="text-sm text-slate-700">Shuru</label>
            <input id="fromDate" type="date" max={today} required className={field}
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="toDate" className="text-sm text-slate-700">Sesh</label>
            <input id="toDate" type="date" max={today} required className={field}
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Wait..." : "Dekhao"}
          </button>
          <button type="button" onClick={() => setRange(today, today)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs">
            Aj
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Khuchra bikri</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatTaka(report.retail.totalPaisa)}
          </div>
          <div className="text-xs text-slate-500">{report.retail.count} ta</div>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Wholesale bikri</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatTaka(report.wholesale.totalPaisa)}
          </div>
          <div className="text-xs text-slate-500">
            {report.wholesale.count} ta · baki {formatTaka(report.wholesale.duePaisa)}
          </div>
        </div>
        <div className="rounded-xl bg-teal-50 p-4 shadow-sm">
          <div className="text-xs text-teal-700">Mot bikri</div>
          <div className="text-lg font-semibold text-teal-900">
            {formatTaka(report.grandTotalPaisa)}
          </div>
          {report.cancelledCount > 0 && (
            <div className="text-xs text-slate-500">
              {report.cancelledCount} ta cancel (hisab e nai)
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Dhoron</th>
              <th className="p-3">Invoice / Buyer</th>
              <th className="p-3 text-right">Mot</th>
              <th className="p-3 text-right">Joma</th>
              <th className="p-3 text-right">Baki</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-slate-400">
                  Ei somoy e kono bikri nai.
                </td>
              </tr>
            )}
            {report.rows.map((row) => (
              <tr key={row.saleId}
                className={`border-b border-slate-100 ${row.cancelled ? "text-slate-400" : ""}`}>
                <td className="p-3">{formatDhakaDateTime(row.createdAt)}</td>
                <td className="p-3">
                  {row.type === "retail" ? "Khuchra" : "Wholesale"}
                  {row.cancelled && (
                    <span className="ml-2 text-xs text-red-600">Cancelled</span>
                  )}
                </td>
                <td className="p-3">
                  {row.invoiceNo ? (
                    <Link href={`/invoice/${row.saleId}`} className="text-teal-700 hover:underline">
                      {row.invoiceNo}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                  {row.buyerName && (
                    <span className="ml-2 text-xs text-slate-500">{row.buyerName}</span>
                  )}
                </td>
                <td className={`p-3 text-right ${row.cancelled ? "line-through" : ""}`}>
                  {formatTaka(row.totalPaisa)}
                </td>
                <td className="p-3 text-right">{formatTaka(row.paidPaisa)}</td>
                <td className={`p-3 text-right ${
                  !row.cancelled && row.duePaisa > 0 ? "text-red-600" : ""
                }`}>
                  {formatTaka(row.duePaisa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(admin)/reports/page.tsx`:

```typescript
import { salesReport } from "@/actions/reports";
import { dhakaToday } from "@/lib/dhakaDate";
import { ReportView } from "@/components/ReportView";

export default async function ReportsPage() {
  // Opens on today, which is the range the owner wants most often.
  const today = dhakaToday();
  const initialReport = await salesReport(today, today);

  return <ReportView initialReport={initialReport} today={today} />;
}
```

- [ ] **Step 3: Add the nav link**

In `src/components/AdminNav.tsx`, add to `LINKS` between the `/due` and `/settings` entries:

```typescript
  { href: "/reports", label: "Report" },
```

- [ ] **Step 4: Verify in the browser**

The live database holds the owner's real data — a medicine "Napa", a buyer "Afnan", and one wholesale sale `ABC-000001` (total ৳900, due ৳400). **Do not delete or modify it.** You can read it, and you may add clearly-named scratch data if you remove exactly what you created.

Run `npm run dev`, log in, go to `/reports`:
- It opens on today's range
- Set the range to cover the date of `ABC-000001` → the sale appears, wholesale total ৳900.00, due ৳400.00, retail ৳0.00
- Click the invoice number → the invoice renders
- Set the range to a period with no sales → "Ei somoy e kono bikri nai." and all totals ৳0.00
- Set Sesh earlier than Shuru → the Banglish error appears rather than a crash
- Click "Aj" → the range snaps to today

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/reports" src/components/ReportView.tsx src/components/AdminNav.tsx
git commit -m "feat: add sales report screen"
```

---

### Task 4: Dashboard summary action

**Files:**
- Create: `src/actions/dashboard.ts`
- Modify: `src/lib/dueDisplay.ts`
- Modify: `src/components/DueTable.tsx`
- Test: `tests/actions/dashboard.test.ts`
- Test: `tests/lib/dueDisplay.test.ts`

**Interfaces:**
- Consumes: `dhakaDayBounds`, `dhakaToday` (Task 1), `listBuyerDues` (`src/actions/due.ts`), `SaleModel`, `MedicineModel`, `requireAdminAction`
- Also produces: `splitDueTotals(rows: { duePaisa: number }[]): { totalDuePaisa: number; totalCreditPaisa: number }` in `src/lib/dueDisplay.ts` — see Step 0.
- Produces:
  - `type LowStockRow = { medicineId: string; name: string; stockPatas: number; patasPerBox: number; lowStockThreshold: number }`
  - `type DashboardSummary = { today: string; todayTotalPaisa: number; todayRetailPaisa: number; todayWholesalePaisa: number; todaySaleCount: number; totalDuePaisa: number; totalCreditPaisa: number; lowStock: LowStockRow[] }`
  - `dashboardSummary(): Promise<DashboardSummary>`

- [ ] **Step 0: Extract the due/credit split before writing a second copy of it**

`src/components/DueTable.tsx` already partitions the signed balances into "what buyers owe" and "credit the pharmacy owes", with a comment explaining why they are never netted into one number. The dashboard needs exactly the same split — and writing it a second time is how the two screens drift into disagreeing, which is the same class of bug (two definitions of one figure) that made cancelling a sale silently forgive a buyer's debts.

Add to `src/lib/dueDisplay.ts`:

```typescript
/**
 * Splits signed balances into what buyers owe and what the pharmacy owes
 * them, as two positive figures.
 *
 * These are deliberately NOT netted into one number: a buyer sitting on
 * credit would otherwise shrink the total the owner is actually owed, hiding
 * one buyer's debt behind another's credit. The owner needs both figures.
 */
export function splitDueTotals(
  rows: { duePaisa: number }[],
): { totalDuePaisa: number; totalCreditPaisa: number } {
  return {
    totalDuePaisa: rows.reduce((total, row) => total + Math.max(0, row.duePaisa), 0),
    totalCreditPaisa: rows.reduce((total, row) => total + Math.max(0, -row.duePaisa), 0),
  };
}
```

Add to `tests/lib/dueDisplay.test.ts` (create it if absent; if it exists, append and do not weaken what is there):

```typescript
import { describe, it, expect } from "vitest";
import { splitDueTotals } from "@/lib/dueDisplay";

describe("splitDueTotals", () => {
  it("is zero for nobody", () => {
    expect(splitDueTotals([])).toEqual({ totalDuePaisa: 0, totalCreditPaisa: 0 });
  });

  it("sums what buyers owe", () => {
    expect(splitDueTotals([{ duePaisa: 12000 }, { duePaisa: 3000 }])).toEqual({
      totalDuePaisa: 15000,
      totalCreditPaisa: 0,
    });
  });

  it("reports credit separately as a positive figure", () => {
    expect(splitDueTotals([{ duePaisa: -12000 }])).toEqual({
      totalDuePaisa: 0,
      totalCreditPaisa: 12000,
    });
  });

  it("never lets one buyer's credit hide another's debt", () => {
    // Netted, this would read as 0 owed — and the owner would stop chasing
    // the 12000 he is actually owed.
    expect(splitDueTotals([{ duePaisa: 12000 }, { duePaisa: -12000 }])).toEqual({
      totalDuePaisa: 12000,
      totalCreditPaisa: 12000,
    });
  });

  it("ignores settled buyers", () => {
    expect(splitDueTotals([{ duePaisa: 0 }, { duePaisa: 5000 }])).toEqual({
      totalDuePaisa: 5000,
      totalCreditPaisa: 0,
    });
  });
});
```

Then change `src/components/DueTable.tsx` to call `splitDueTotals(dues)` instead of its two inline `reduce` calls, keeping its rendering exactly as it is. Run `npx vitest run tests/lib/dueDisplay.test.ts` and `npm test`; the existing DueTable behaviour must be unchanged.

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/dashboard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { dashboardSummary } from "@/actions/dashboard";
import { SaleModel } from "@/models/Sale";
import { MedicineModel } from "@/models/Medicine";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

const ADMIN_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

// Freeze "now" at 12:00 Dhaka on 2026-07-17 (06:00 UTC) so "today" is
// deterministic rather than depending on when the suite runs.
const NOW = new Date("2026-07-17T06:00:00Z");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setSessionCookie(cookieStore, await adminToken());
});

afterEach(() => {
  vi.useRealTimers();
});

async function makeSale(overrides: Record<string, unknown> = {}) {
  const sale = await SaleModel.create({
    type: "retail",
    buyerId: null,
    buyerName: "",
    buyerShopName: "",
    invoiceNo: null,
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        unit: "pata",
        quantity: 2,
        ratePaisa: 1400,
        lineTotalPaisa: 2800,
        patasDeducted: 2,
      },
    ],
    subtotalPaisa: 2800,
    discountPaisa: 0,
    totalPaisa: 2800,
    paidPaisa: 2800,
    duePaisa: 0,
    status: "active",
    createdBy: ADMIN_ID,
    ...overrides,
  });
  if (overrides.createdAt) {
    await SaleModel.updateOne(
      { _id: sale._id },
      { $set: { createdAt: overrides.createdAt } },
      { timestamps: false },
    );
  }
  return sale;
}

async function makeMedicine(overrides: Record<string, unknown> = {}) {
  const name = (overrides.name as string) ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas: 500,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

describe("dashboardSummary", () => {
  it("reports today's Dhaka date", async () => {
    expect((await dashboardSummary()).today).toBe("2026-07-17");
  });

  it("is all zeros on a quiet day", async () => {
    const summary = await dashboardSummary();
    expect(summary.todayTotalPaisa).toBe(0);
    expect(summary.todaySaleCount).toBe(0);
    expect(summary.totalDuePaisa).toBe(0);
    expect(summary.lowStock).toEqual([]);
  });

  it("totals today's sales", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({ createdAt: new Date("2026-07-17T05:30:00Z") });
    const summary = await dashboardSummary();
    expect(summary.todaySaleCount).toBe(2);
    expect(summary.todayTotalPaisa).toBe(5600);
  });

  it("splits today's retail and wholesale", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({
      type: "wholesale",
      invoiceNo: "ABC-000001",
      buyerName: "Karim",
      totalPaisa: 36000,
      subtotalPaisa: 36000,
      paidPaisa: 36000,
      createdAt: new Date("2026-07-17T05:30:00Z"),
    });

    const summary = await dashboardSummary();
    expect(summary.todayRetailPaisa).toBe(2800);
    expect(summary.todayWholesalePaisa).toBe(36000);
    expect(summary.todayTotalPaisa).toBe(38800);
  });

  it("ignores yesterday's sales", async () => {
    await makeSale({ createdAt: new Date("2026-07-16T05:00:00Z") });
    expect((await dashboardSummary()).todaySaleCount).toBe(0);
  });

  it("counts a sale made after Dhaka midnight as today", async () => {
    // 00:30 Dhaka on the 17th is 18:30 UTC on the 16th. A UTC-day dashboard
    // would file this under yesterday and understate the day's takings.
    await makeSale({ createdAt: new Date("2026-07-16T18:30:00Z") });
    expect((await dashboardSummary()).todaySaleCount).toBe(1);
  });

  it("excludes a cancelled sale from today's total", async () => {
    await makeSale({ createdAt: new Date("2026-07-17T05:00:00Z") });
    await makeSale({
      status: "cancelled",
      cancelReason: "Ferot",
      createdAt: new Date("2026-07-17T05:30:00Z"),
    });

    const summary = await dashboardSummary();
    expect(summary.todaySaleCount).toBe(1);
    expect(summary.todayTotalPaisa).toBe(2800);
  });

  it("lists a medicine at or below its low-stock threshold", async () => {
    await makeMedicine({ name: "Low One", stockPatas: 20, lowStockThreshold: 20 });
    await makeMedicine({ name: "Fine One", stockPatas: 21, lowStockThreshold: 20 });

    const summary = await dashboardSummary();
    expect(summary.lowStock.map((m) => m.name)).toEqual(["Low One"]);
  });

  it("carries what the low-stock display needs", async () => {
    await makeMedicine({ name: "Low One", stockPatas: 8, lowStockThreshold: 20 });
    const [row] = (await dashboardSummary()).lowStock;
    expect(row.stockPatas).toBe(8);
    expect(row.patasPerBox).toBe(10);
    expect(row.lowStockThreshold).toBe(20);
    expect(row.medicineId).toBeTypeOf("string");
  });

  it("ignores a deactivated medicine", async () => {
    await makeMedicine({ name: "Gone", stockPatas: 0, active: false });
    expect((await dashboardSummary()).lowStock).toEqual([]);
  });

  it("ignores a medicine whose threshold is zero and stock is zero", async () => {
    // A threshold of 0 means the owner set no alert for this medicine; an
    // empty one should not then nag him forever.
    await makeMedicine({ name: "No Alert", stockPatas: 0, lowStockThreshold: 0 });
    expect((await dashboardSummary()).lowStock).toEqual([]);
  });

  it("sorts the lowest stock first", async () => {
    await makeMedicine({ name: "Some", stockPatas: 15, lowStockThreshold: 20 });
    await makeMedicine({ name: "Almost None", stockPatas: 2, lowStockThreshold: 20 });

    const summary = await dashboardSummary();
    expect(summary.lowStock.map((m) => m.name)).toEqual(["Almost None", "Some"]);
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(dashboardSummary()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(dashboardSummary()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/dashboard.test.ts`
Expected: FAIL — cannot resolve `@/actions/dashboard`.

- [ ] **Step 3: Write the action**

Create `src/actions/dashboard.ts`:

```typescript
"use server";

import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { dhakaToday, dhakaDayBounds } from "@/lib/dhakaDate";
import { listBuyerDues } from "@/actions/due";
import { splitDueTotals } from "@/lib/dueDisplay";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";

export type LowStockRow = {
  medicineId: string;
  name: string;
  stockPatas: number;
  patasPerBox: number;
  lowStockThreshold: number;
};

export type DashboardSummary = {
  today: string;
  todayTotalPaisa: number;
  todayRetailPaisa: number;
  todayWholesalePaisa: number;
  todaySaleCount: number;
  /** Sum of what buyers owe. Buyers in credit are excluded — see below. */
  totalDuePaisa: number;
  /** Sum of credit the pharmacy owes buyers, as a positive number. */
  totalCreditPaisa: number;
  lowStock: LowStockRow[];
};

/**
 * The owner's business at a glance: what sold today, what he is owed, and
 * what is running out.
 *
 * "Today" is a Dhaka day, not a UTC one — a sale rung up at 00:30 Dhaka is
 * stored as 18:30 UTC the previous day, and a UTC-bounded query would file
 * it under yesterday. See src/lib/dhakaDate.ts.
 *
 * Cancelled sales are excluded from today's takings, matching salesReport,
 * buyerLedger, and listBuyerDues.
 */
export async function dashboardSummary(): Promise<DashboardSummary> {
  await requireAdminAction();
  await connectDb();

  const today = dhakaToday();
  const { start, end } = dhakaDayBounds(today);

  const [todaySales, dues, lowStockDocs] = await Promise.all([
    SaleModel.find({
      createdAt: { $gte: start, $lt: end },
      status: "active",
    }).lean<SaleDoc[]>(),
    listBuyerDues(),
    // A threshold of 0 means the owner set no alert for that medicine, so an
    // empty one must not nag him forever — hence $gt: 0 rather than $gte.
    MedicineModel.find({
      active: true,
      lowStockThreshold: { $gt: 0 },
      $expr: { $lte: ["$stockPatas", "$lowStockThreshold"] },
    })
      .sort({ stockPatas: 1 })
      .lean<MedicineDoc[]>(),
  ]);

  const sumBy = (type: "retail" | "wholesale") =>
    todaySales
      .filter((sale) => sale.type === type)
      .reduce((total, sale) => total + sale.totalPaisa, 0);

  const todayRetailPaisa = sumBy("retail");
  const todayWholesalePaisa = sumBy("wholesale");

  // Shared with DueTable via splitDueTotals so the two screens cannot drift
  // into reporting different figures for the same money.
  const { totalDuePaisa, totalCreditPaisa } = splitDueTotals(dues);

  return {
    today,
    todayTotalPaisa: todayRetailPaisa + todayWholesalePaisa,
    todayRetailPaisa,
    todayWholesalePaisa,
    todaySaleCount: todaySales.length,
    totalDuePaisa,
    totalCreditPaisa,
    lowStock: lowStockDocs.map((medicine) => ({
      medicineId: medicine._id.toString(),
      name: medicine.name,
      stockPatas: medicine.stockPatas,
      patasPerBox: medicine.patasPerBox,
      lowStockThreshold: medicine.lowStockThreshold,
    })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/dashboard.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/actions/dashboard.ts tests/actions/dashboard.test.ts src/lib/dueDisplay.ts tests/lib/dueDisplay.test.ts src/components/DueTable.tsx
git commit -m "feat: add dashboard summary action"
```

---

### Task 5: The real dashboard

Replaces the placeholder from Plan 1.

**Files:**
- Modify: `src/app/(admin)/dashboard/page.tsx` (replace entirely)
- Create: `src/components/DashboardCards.tsx`

**Interfaces:**
- Consumes: `dashboardSummary`, `DashboardSummary`, `LowStockRow` (Task 4), `formatTaka`, `formatStock`, `formatDhakaDate`
- Produces: the dashboard the owner sees on login

- [ ] **Step 1: Write the cards**

Create `src/components/DashboardCards.tsx`:

```typescript
import Link from "next/link";
import type { DashboardSummary } from "@/actions/dashboard";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";

export function DashboardCards({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-teal-50 p-4 shadow-sm">
          <div className="text-xs text-teal-700">Aj ker bikri</div>
          <div className="text-2xl font-semibold text-teal-900">
            {formatTaka(summary.todayTotalPaisa)}
          </div>
          <div className="mt-1 text-xs text-teal-700">
            {summary.todaySaleCount} ta bikri · khuchra{" "}
            {formatTaka(summary.todayRetailPaisa)} · wholesale{" "}
            {formatTaka(summary.todayWholesalePaisa)}
          </div>
        </div>

        <Link href="/due" className="rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="text-xs text-slate-500">Mot baki</div>
          <div className={`text-2xl font-semibold ${
            summary.totalDuePaisa > 0 ? "text-red-600" : "text-slate-400"
          }`}>
            {formatTaka(summary.totalDuePaisa)}
          </div>
          {summary.totalCreditPaisa > 0 && (
            <div className="mt-1 text-xs text-teal-700">
              Buyer der joma ache {formatTaka(summary.totalCreditPaisa)}
            </div>
          )}
        </Link>

        <Link href="/medicines" className="rounded-xl bg-white p-4 shadow-sm hover:bg-slate-50">
          <div className="text-xs text-slate-500">Stock kom</div>
          <div className={`text-2xl font-semibold ${
            summary.lowStock.length > 0 ? "text-amber-600" : "text-slate-400"
          }`}>
            {summary.lowStock.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">ta medicine</div>
        </Link>
      </div>

      {summary.lowStock.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-slate-900">Stock kome geche</h2>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="p-3">Medicine</th>
                  <th className="p-3">Ekhon ache</th>
                  <th className="p-3">Alert level</th>
                </tr>
              </thead>
              <tbody>
                {summary.lowStock.map((row) => (
                  <tr key={row.medicineId} className="border-b border-slate-100">
                    <td className="p-3 font-medium text-slate-900">{row.name}</td>
                    <td className="p-3 font-medium text-amber-600">
                      {formatStock(row.stockPatas, row.patasPerBox)}
                    </td>
                    <td className="p-3 text-slate-500">
                      {row.lowStockThreshold} pata
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Stock In menu theke notun maal dhukao.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder page**

Replace `src/app/(admin)/dashboard/page.tsx` entirely:

```typescript
import { dashboardSummary } from "@/actions/dashboard";
import { DashboardCards } from "@/components/DashboardCards";

export default async function DashboardPage() {
  const summary = await dashboardSummary();
  return <DashboardCards summary={summary} />;
}
```

- [ ] **Step 3: Verify in the browser**

The live database holds the owner's real data — medicine "Napa" (stock 900 patas, threshold 20), buyer "Afnan", and sale `ABC-000001` (total ৳900, due ৳400). **Do not delete or modify it.** You may add clearly-named scratch data if you remove exactly what you created.

Run `npm run dev`, log in, land on `/dashboard`:
- "Mot baki" shows ৳400.00 (the outstanding on `ABC-000001` less the ৳200 payment is ৳200 — confirm the figure matches what `/due` shows for Afnan; if the two screens disagree, **stop and report it**, because that is the bug this plan's shared-convention comment exists to prevent)
- "Stock kom" shows 0, since Napa's 900 patas are far above its threshold of 20
- Clicking "Mot baki" goes to `/due`; clicking "Stock kom" goes to `/medicines`
- "Aj ker bikri" reflects today's Dhaka takings — if the owner's sale was made on an earlier date, this correctly reads ৳0.00
- To exercise the low-stock table, temporarily raise Napa's `lowStockThreshold` above 900 via a scratch script, reload, confirm Napa appears in "Stock kome geche" with its stock rendered as "90 box", then **put the threshold back to 20**

- [ ] **Step 4: Run the whole suite**

Run: `npm test` — expected PASS.
Run: `npx tsc --noEmit` — expected clean.
Run: `npm run build` — expected success.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/dashboard" src/components/DashboardCards.tsx
git commit -m "feat: replace the dashboard placeholder with the real one"
```

---

## Done when

- `/reports` shows sales over any Dhaka date range, retail and wholesale totalled separately, with cancelled sales listed but excluded from totals
- A sale made at 00:30 Dhaka is reported on the correct day, not the previous UTC one
- `/dashboard` opens on today's takings, what buyers owe, and what is running out — with credit reported separately from debt, never netted into one figure
- The dashboard's "Mot baki" agrees with `/due`
- `npm test` passes, `tsc --noEmit` is clean, `npm run build` succeeds

## Deliberately not in this plan

- **The buyer portal** — Plan 4: buyer login, browsing at box rate, cart, order submission, and admin approval. The dashboard's "pending order count" (spec, Dashboard row) belongs there, since no `Order` model exists yet; add that card when the portal lands.
- Everything in the spec's non-goals: purchase entry with cost price, profit reporting, expiry/batch tracking, expense entry, per-buyer pricing, staff accounts, retail receipt printing, barcode scanning.

## Notes for Plan 4 (buyer portal)

- Order approval must copy the pattern in `recordWholesaleSale`: read inside `withTransaction`, precondition in `applyStockDelta`'s filter, invoice number from `nextInvoiceSeq` in the same transaction. A bare `$inc` takes stock negative — Mongoose's `min: 0` does not run on it.
- Buyer-facing actions need a **buyer-scoped** guard that also verifies the caller owns the data. `requireAdminAction()` is the wrong shape. Extend `tests/actions/authorization.test.ts` to cover that class.
- `readSettings()` (unguarded) is what the portal shell should use for the pharmacy name.
- `BuyerModel` already stores `passwordHash`, so accounts created in Plan 2 can log in.
- Add the "pending order count" card to `DashboardCards` and `dashboardSummary` when the `Order` model exists.
