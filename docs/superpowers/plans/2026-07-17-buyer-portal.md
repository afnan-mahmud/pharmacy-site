# ABC Pharmacy — Buyer Portal Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the pharmacy's wholesale buyers log in, order for themselves, and let the owner approve each order into the wholesale sale and invoice the system already builds.

**Architecture:** One new `Order` model. A buyer-scoped session guard beside the admin one. A `(buyer)` route group mirroring `(admin)`. Order approval reuses the Sale plan's atomic transaction by extracting its core into one shared writer, so "make a wholesale sale" has exactly one definition whether it comes from the form or an approved order.

**Tech Stack:** Next.js (App Router, TypeScript), MongoDB Atlas, Mongoose, Tailwind CSS, Vitest, mongodb-memory-server.

**Design:** `docs/superpowers/specs/2026-07-17-buyer-portal-design.md`
**Builds on:** Plans 1, 2, 3 (all complete)

## Global Constraints

Copied from the spec and Plans 1-3. Every task's requirements implicitly include these.

- **Money is stored as integer paisa, never floats.** Conversion only at the UI boundary via `src/lib/money.ts`. `formatTaka(-1250)` returns `"-৳12.50"`.
- **Stock is stored as integer patas, never boxes.** Every stock change goes through `applyStockDelta(medicineId, delta, session)` from `src/lib/stockTransaction.ts`, inside an open transaction, with the read *inside* `withTransaction`. A bare `updateOne({ _id }, { $inc })` takes stock negative — Mongoose `min: 0` does **not** run on `$inc`. Verified empirically, twice, in this project.
- **Every server action calls its guard as its first statement.** Admin actions call `requireAdminAction()`; buyer actions call `requireBuyerAction()`. Server actions are independently-callable POST endpoints whose IDs ship in the public client bundle. `tests/actions/authorization.test.ts` discovers action modules automatically and holds every export to its module's guard.
- **A buyer guard proving "some buyer" is not enough.** Every buyer action that names a specific order or balance must also verify the session buyer *owns* it — a buyer must never read or cancel another buyer's order by passing its id. The ownership check lives in each action, not the guard.
- **A cancelled or rejected order creates no sale. An approved order becomes a fully-unpaid wholesale sale** (`paidPaisa: 0`, all due). The buyer pays nothing at order time.
- **Prices are snapshotted onto the order at submission**, the same way sale lines snapshot them — a later price change never rewrites what the buyer ordered.
- **Pharmacy name is never hardcoded.** `"ABC Pharmacy"` exists only as the schema default in `src/models/Settings.ts`. The portal shell reads it from `readSettings()`.
- **Currency symbol:** `৳`. **User-facing strings are Banglish** — Bengali in **Latin letters only** ("Order dao", "Amar order", "Pending"). Never Bengali script. `৳` is exempt.
- **Timezone:** `Asia/Dhaka` for all date display — use `formatDhakaDate`/`formatDhakaDateTime` from `src/lib/dhakaDate.ts`.
- **Tests must pass before every commit.** Suite is currently 387 passed / 3 skipped across 23 files.

## Existing interfaces this plan consumes

Read before starting; modify only where a task says so.

- `src/lib/auth.ts` — `createSessionToken(payload: { userId; role: "admin" | "buyer"; name })`, `verifyPassword(plain, hash)`, `type SessionPayload`, `type Role`.
- `src/lib/session.ts` — `getSession(): Promise<SessionPayload | null>`, `SESSION_COOKIE`, `requireAdmin()`, `requireAdminAction()`, `ADMIN_ONLY_ERROR`. Task 2 adds the buyer equivalents here.
- `src/lib/db.ts` — `connectDb()`.
- `src/lib/serialize.ts` — `toPlain`, `toPlainList`, `type Serialized<T>`.
- `src/lib/money.ts` — `takaToPaisa`, `paisaToTaka`, `formatTaka`.
- `src/lib/units.ts` — `boxesToPatas`, `splitStock`, `formatStock`.
- `src/lib/stockTransaction.ts` — `applyStockDelta(medicineId, delta, session): Promise<boolean>` (true = applied; false = precondition failed).
- `src/lib/saleTotals.ts` — `lineTotal({ ratePaisa, quantity })`, `computeTotals(lines, discountPaisa, paidPaisa)`.
- `src/lib/invoiceNumber.ts` — `nextInvoiceSeq(session): Promise<number>`, `formatInvoiceNo(prefix, seq)`.
- `src/models/Buyer.ts` — `BuyerModel`, `BuyerDoc`, `PublicBuyerDoc`. Fields: `name`, `shopName`, `phone` (unique), `address`, `passwordHash`, `active`.
- `src/models/Medicine.ts` — `MedicineModel`, `MedicineDoc`: `name`, `patasPerBox`, `boxPricePaisa`, `pataPricePaisa`, `stockPatas`, `active`.
- `src/models/Sale.ts` — `SaleModel`, `SaleDoc`. Already has an `orderId` field (default null) for this plan to link.
- `src/models/Settings.ts` — `SettingsModel`, `SettingsDoc`.
- `src/actions/sales.ts` — `recordWholesaleSale`, `getSale`, `cancelSale`, `type WholesaleSaleInput`. Task 4 refactors this file's internals.
- `src/actions/buyers.ts` — `listBuyers`, `getBuyer`.
- `src/actions/due.ts` — `buyerDueBalance(buyerId): Promise<number>` (signed), `buyerLedger(buyerId)`.
- `src/actions/dashboard.ts` — `dashboardSummary(): Promise<DashboardSummary>`. Task 7 adds a field.
- `src/components/MedicinePicker.tsx` — `MedicinePicker`, `type PickedMedicine` (`{ id, name, genericName, patasPerBox, boxPricePaisa, pataPricePaisa, stockPatas }`). Reusable; the buyer browse screen uses it but must not surface stock or pata price.
- `tests/helpers/db.ts` — `setupTestDb()`. `tests/helpers/auth.ts` — `createMockCookieStore`, `setSessionCookie`, `clearSessionCookie`, `adminToken()`, `buyerToken()`, `ADMIN_USER_ID`, `BUYER_USER_ID`. Read `tests/actions/medicines.test.ts` for the `vi.mock("next/headers")` shape.

---

### Task 1: Order model

**Files:**
- Create: `src/models/Order.ts`
- Test: `tests/models/Order.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `OrderModel`, `OrderDoc`, `OrderLineDoc`
  - `type OrderStatus = "pending" | "approved" | "rejected" | "cancelled"`

- [ ] **Step 1: Write the failing tests**

Create `tests/models/Order.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { OrderModel } from "@/models/Order";

setupTestDb();

const BUYER_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    buyerId: BUYER_ID,
    buyerName: "Karim Uddin",
    buyerShopName: "Karim Medical Hall",
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        boxes: 3,
        boxPricePaisa: 12000,
      },
    ],
    ...overrides,
  };
}

describe("Order model", () => {
  it("defaults a new order to pending with no sale or reject reason", async () => {
    const order = await OrderModel.create(baseOrder());
    expect(order.status).toBe("pending");
    expect(order.saleId).toBeNull();
    expect(order.rejectReason).toBe("");
    expect(order.resolvedAt).toBeNull();
  });

  it("snapshots the line's medicine name and price", async () => {
    const order = await OrderModel.create(baseOrder());
    expect(order.items[0].medicineName).toBe("Napa 500mg");
    expect(order.items[0].boxPricePaisa).toBe(12000);
    expect(order.items[0].boxes).toBe(3);
  });

  it("requires at least one item", async () => {
    await expect(OrderModel.create(baseOrder({ items: [] }))).rejects.toThrow();
  });

  it("rejects a box count below 1", async () => {
    await expect(
      OrderModel.create(
        baseOrder({
          items: [
            { medicineId: MEDICINE_ID, medicineName: "Napa", boxes: 0, boxPricePaisa: 12000 },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("accepts each valid status", async () => {
    for (const status of ["pending", "approved", "rejected", "cancelled"] as const) {
      const order = await OrderModel.create(baseOrder({ status }));
      expect(order.status).toBe(status);
    }
  });

  it("rejects an unknown status", async () => {
    await expect(
      OrderModel.create(baseOrder({ status: "shipped" })),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/models/Order.test.ts`
Expected: FAIL — cannot resolve `@/models/Order`.

- [ ] **Step 3: Write the model**

Create `src/models/Order.ts`:

```typescript
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export type OrderStatus = "pending" | "approved" | "rejected" | "cancelled";

const orderLineSchema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: "Medicine", required: true },
    // Denormalised so the order still reads correctly if the medicine is
    // later renamed or deactivated.
    medicineName: { type: String, required: true },
    boxes: { type: Number, required: true, min: 1 },
    // Snapshotted at order time: a price change before approval must never
    // silently rewrite what the buyer thought he was ordering.
    boxPricePaisa: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
      index: true,
    },
    // Denormalised so the owner's pending-order list reads without a join.
    buyerName: { type: String, required: true },
    buyerShopName: { type: String, default: "" },
    items: {
      type: [orderLineSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "Order e at least ekta item lagbe",
      },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      required: true,
      default: "pending",
    },
    // Set only when approved — links to the wholesale sale it became.
    saleId: { type: Schema.Types.ObjectId, ref: "Sale", default: null },
    rejectReason: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The owner's pending list is "oldest pending first"; a buyer's list is
// "my orders, newest first". Both are covered here.
orderSchema.index({ status: 1, createdAt: 1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });

export type OrderLineDoc = InferSchemaType<typeof orderLineSchema>;
export type OrderDoc = InferSchemaType<typeof orderSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const OrderModel: Model<OrderDoc> =
  (mongoose.models.Order as Model<OrderDoc>) ??
  mongoose.model<OrderDoc>("Order", orderSchema);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/models/Order.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/models/Order.ts tests/models/Order.test.ts
git commit -m "feat: add order model"
```

---

### Task 2: Buyer session guards and login

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/actions/auth.ts`
- Modify: `tests/actions/authorization.test.ts`
- Test: `tests/lib/session.test.ts` (append), `tests/actions/auth.test.ts` (append)

**Interfaces:**
- Consumes: `getSession`, `createSessionToken`, `verifyPassword`, `BuyerModel`, `SESSION_COOKIE`
- Produces:
  - `BUYER_ONLY_ERROR` (in `session.ts`)
  - `requireBuyer(): Promise<SessionPayload>` — redirects a non-buyer to `/buyer/login`
  - `requireBuyerAction(): Promise<SessionPayload>` — throws `BUYER_ONLY_ERROR` for a non-buyer
  - `buyerLogin(phone: string, password: string): Promise<LoginResult>` (in `auth.ts`)
  - `buyerLogout(): Promise<void>` (in `auth.ts`)

- [ ] **Step 1: Write the failing session-guard tests**

Append to `tests/lib/session.test.ts` (read the file first; it already mocks `next/headers` and `next/navigation` and imports `createSessionToken`). Add:

```typescript
import { requireBuyer, requireBuyerAction, BUYER_ONLY_ERROR } from "@/lib/session";

describe("requireBuyerAction", () => {
  it("returns the session for a buyer token", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    const session = await requireBuyerAction();
    expect(session.role).toBe("buyer");
  });

  it("throws for an admin token", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(requireBuyerAction()).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("throws with no session", async () => {
    clearSessionCookie(cookieStore);
    await expect(requireBuyerAction()).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

describe("requireBuyer", () => {
  it("redirects an admin to the buyer login", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(requireBuyer()).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/buyer/login");
  });

  it("returns the session for a buyer", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    const session = await requireBuyer();
    expect(session.role).toBe("buyer");
  });
});
```

Note: match the exact names the existing file uses for the redirect mock and the imports (it may call it `redirectMock` or similar, and it imports `setSessionCookie`/`adminToken`/`buyerToken` already). Read the file and adapt these to its established shape rather than adding a second mock.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: FAIL — `requireBuyer`/`requireBuyerAction`/`BUYER_ONLY_ERROR` not exported.

- [ ] **Step 3: Add the buyer guards**

In `src/lib/session.ts`, after the admin guards, add:

```typescript
export const BUYER_ONLY_ERROR = "Buyer login chara ei kaj kora jabe na";

/** Page guard for buyer routes — redirects a non-buyer to the buyer login. */
export async function requireBuyer(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") redirect("/buyer/login");
  return session;
}

/**
 * Action guard for buyer server actions. Throws rather than redirects, for
 * the same reason requireAdminAction does: a server action is a POST-shaped
 * endpoint with no page render to turn a redirect into. See requireAdminAction.
 *
 * This proves only that *some* buyer is calling. It does NOT prove the buyer
 * owns the data an action names — that check must live in each action, which
 * is the only place that knows which order or balance is being touched.
 */
export async function requireBuyerAction(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "buyer") {
    throw new Error(BUYER_ONLY_ERROR);
  }
  return session;
}
```

- [ ] **Step 4: Run to verify the guard tests pass**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing buyer-login tests**

Append to `tests/actions/auth.test.ts` (read it first; it mocks `next/headers` and seeds an admin user in `beforeEach`). Add a buyer fixture and:

```typescript
import { buyerLogin } from "@/actions/auth";
import { BuyerModel } from "@/models/Buyer";
import { hashPassword } from "@/lib/auth";

describe("buyerLogin", () => {
  beforeEach(async () => {
    await BuyerModel.create({
      name: "Karim Uddin",
      shopName: "Karim Medical Hall",
      phone: "01711111111",
      address: "Mirpur",
      passwordHash: await hashPassword("secret123"),
      active: true,
    });
  });

  it("succeeds with the right phone and password and sets a buyer cookie", async () => {
    const result = await buyerLogin("01711111111", "secret123");
    expect(result.ok).toBe(true);
    expect(cookieStore.set).toHaveBeenCalledOnce();
    const [name, , options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("session");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("fails with a wrong password and sets no cookie", async () => {
    const result = await buyerLogin("01711111111", "wrong");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("gives the same error for an unknown phone as a wrong password", async () => {
    const unknown = await buyerLogin("01799999999", "secret123");
    const wrong = await buyerLogin("01711111111", "wrong");
    expect(unknown).toEqual(wrong);
  });

  it("refuses an inactive buyer with the same generic error", async () => {
    await BuyerModel.updateOne({ phone: "01711111111" }, { $set: { active: false } });
    const result = await buyerLogin("01711111111", "secret123");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("fails a non-string input exactly like a wrong password", async () => {
    // @ts-expect-error deliberately passing a non-string past the type boundary
    const result = await buyerLogin(12345, "secret123");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run tests/actions/auth.test.ts`
Expected: FAIL — `buyerLogin` not exported.

- [ ] **Step 7: Add buyer login and logout**

In `src/actions/auth.ts`, add (mirroring the admin `login`/`logout`, importing `BuyerModel` and `createSessionToken` as needed):

```typescript
import { BuyerModel } from "@/models/Buyer";

// Same discipline as admin login: one message for wrong-phone, wrong-password,
// and inactive-account, so the endpoint can't be probed for which phones exist
// or which accounts are active.
const BUYER_LOGIN_FAILED = "Phone ba password bhul";

export async function buyerLogin(
  phone: string,
  password: string,
): Promise<LoginResult> {
  if (typeof phone !== "string" || typeof password !== "string") {
    return { ok: false, error: BUYER_LOGIN_FAILED };
  }

  await connectDb();

  const buyer = await BuyerModel.findOne({ phone: phone.trim() });
  if (!buyer) return { ok: false, error: BUYER_LOGIN_FAILED };
  // An inactive buyer fails identically to a wrong password — the account
  // still exists (with its order history), it just cannot sign in.
  if (!buyer.active) return { ok: false, error: BUYER_LOGIN_FAILED };

  const valid = await verifyPassword(password, buyer.passwordHash);
  if (!valid) return { ok: false, error: BUYER_LOGIN_FAILED };

  const token = await createSessionToken({
    userId: String(buyer._id),
    role: "buyer",
    name: buyer.name,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { ok: true };
}

export async function buyerLogout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/buyer/login");
}
```

- [ ] **Step 8: Teach the structural authorization test about buyer actions**

`buyerLogin` and `buyerLogout` are unauthenticated-by-nature, like admin `login`/`logout`. Add them to the `auth.ts` exemption in `tests/actions/authorization.test.ts`:

```typescript
  "/src/actions/auth.ts": [
    "login",
    "logout",
    // Buyer equivalents — buyerLogin establishes a buyer session (so it can't
    // require one) and buyerLogout must be callable to clear a cookie. Covered
    // by their own tests in tests/actions/auth.test.ts.
    "buyerLogin",
    "buyerLogout",
  ],
```

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: PASS. The authorization test still passes because the two new auth exports are exempt.

- [ ] **Step 10: Commit**

```bash
git add src/lib/session.ts src/actions/auth.ts tests/lib/session.test.ts tests/actions/auth.test.ts tests/actions/authorization.test.ts
git commit -m "feat: add buyer session guards and phone login"
```

---

### Task 3: Buyer order actions

The buyer's own order operations. Every one is scoped to the session buyer.

**Files:**
- Create: `src/actions/buyerOrders.ts`
- Modify: `tests/actions/authorization.test.ts`
- Test: `tests/actions/buyerOrders.test.ts`

**Interfaces:**
- Consumes: `requireBuyerAction`, `connectDb`, `BuyerModel`, `MedicineModel`, `OrderModel`, `toPlain`/`toPlainList`
- Produces:
  - `type OrderItemInput = { medicineId: string; boxes: number }`
  - `submitOrder(items: OrderItemInput[]): Promise<Serialized<OrderDoc>>`
  - `listMyOrders(): Promise<Serialized<OrderDoc>[]>`
  - `getMyOrder(orderId: string): Promise<Serialized<OrderDoc> | null>`
  - `cancelMyOrder(orderId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/buyerOrders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
  BUYER_USER_ID,
} from "../helpers/auth";
import { BUYER_ONLY_ERROR } from "@/lib/session";
import {
  submitOrder,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
} from "@/actions/buyerOrders";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

// buyerToken() signs a token for BUYER_USER_ID; the buyer document must have
// that exact _id so ownership lines up.
async function makeSessionBuyer(overrides = {}) {
  return BuyerModel.create({
    _id: new mongoose.Types.ObjectId(BUYER_USER_ID),
    name: "Karim Uddin",
    shopName: "Karim Medical Hall",
    phone: "01711111111",
    address: "Mirpur",
    passwordHash: "x",
    active: true,
    ...overrides,
  });
}

async function makeMedicine(overrides = {}) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
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

beforeEach(async () => {
  setSessionCookie(cookieStore, await buyerToken());
});

describe("submitOrder", () => {
  it("creates a pending order snapshotting the box price", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    const order = await submitOrder([
      { medicineId: String(medicine._id), boxes: 3 },
    ]);

    expect(order.status).toBe("pending");
    expect(order.items[0].medicineName).toBe("Napa 500mg");
    expect(order.items[0].boxPricePaisa).toBe(12000);
    expect(order.items[0].boxes).toBe(3);
    expect(order.buyerName).toBe("Karim Uddin");
  });

  it("does not change stock (approval does that, not ordering)", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await submitOrder([{ medicineId: String(medicine._id), boxes: 3 }]);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(500);
  });

  it("rejects an empty cart", async () => {
    await makeSessionBuyer();
    await expect(submitOrder([])).rejects.toThrow("Cart khali");
  });

  it("rejects a zero or fractional box count", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 0 }]),
    ).rejects.toThrow("Box sonkha 1 er kom hote parbe na");
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1.5 }]),
    ).rejects.toThrow("Box sonkha 1 er kom hote parbe na");
  });

  it("rejects the same medicine twice in one order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      submitOrder([
        { medicineId: String(medicine._id), boxes: 1 },
        { medicineId: String(medicine._id), boxes: 2 },
      ]),
    ).rejects.toThrow("ekbar er beshi");
  });

  it("rejects an unknown or malformed medicine", async () => {
    await makeSessionBuyer();
    await expect(
      submitOrder([{ medicineId: "not-an-id", boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
    await expect(
      submitOrder([{ medicineId: "507f1f77bcf86cd799439011", boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to order a deactivated medicine", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine({ active: false });
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to place an order for an inactive buyer", async () => {
    await makeSessionBuyer({ active: false });
    const medicine = await makeMedicine();
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]),
    ).rejects.toThrow("Apnar account bondho ache");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(submitOrder([])).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(submitOrder([])).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

describe("listMyOrders", () => {
  it("returns only the session buyer's orders, newest first", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await submitOrder([{ medicineId: String(medicine._id), boxes: 2 }]);

    // Another buyer's order must not appear.
    const other = new mongoose.Types.ObjectId();
    await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
    });

    const orders = await listMyOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0].items[0].boxes).toBe(2); // newest first
    expect(orders.every((o) => o.buyerName === "Karim Uddin")).toBe(true);
  });
});

describe("getMyOrder — ownership", () => {
  it("returns the buyer's own order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const created = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    const fetched = await getMyOrder(created._id);
    expect(fetched!._id).toBe(created._id);
  });

  it("returns null for another buyer's order — never leaks it", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const other = new mongoose.Types.ObjectId();
    const foreign = await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
    });
    expect(await getMyOrder(String(foreign._id))).toBeNull();
  });

  it("returns null for a malformed id", async () => {
    await makeSessionBuyer();
    expect(await getMyOrder("not-an-id")).toBeNull();
  });
});

describe("cancelMyOrder — ownership and status", () => {
  it("cancels the buyer's own pending order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const order = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await cancelMyOrder(order._id);
    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("cancelled");
  });

  it("refuses to cancel another buyer's order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const other = new mongoose.Types.ObjectId();
    const foreign = await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
    });
    await expect(cancelMyOrder(String(foreign._id))).rejects.toThrow(
      "Order pawa jay ni",
    );
    // and it stays pending
    expect((await OrderModel.findById(foreign._id))!.status).toBe("pending");
  });

  it("refuses to cancel an order that is no longer pending", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const order = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await OrderModel.updateOne({ _id: order._id }, { $set: { status: "approved" } });
    await expect(cancelMyOrder(order._id)).rejects.toThrow(
      "Ei order ar cancel kora jabe na",
    );
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(cancelMyOrder("507f1f77bcf86cd799439011")).rejects.toThrow(
      BUYER_ONLY_ERROR,
    );
  });
});
```

Note: `submitOrder` takes the items array directly — `submitOrder([...])`, not `submitOrder({ items: [...] })`. Every call in these tests uses the array form.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/actions/buyerOrders.test.ts`
Expected: FAIL — cannot resolve `@/actions/buyerOrders`.

- [ ] **Step 3: Write the actions**

Create `src/actions/buyerOrders.ts`:

```typescript
"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireBuyerAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel, type OrderDoc } from "@/models/Order";

export type OrderItemInput = { medicineId: string; boxes: number };

/**
 * Network-reachable trust boundary — same convention as
 * src/actions/medicines.ts. Validates shape before any database work.
 */
function validateItems(items: OrderItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart khali");
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 1
    ) {
      throw new Error("Box sonkha 1 er kom hote parbe na");
    }
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi order kora jabe na");
    }
    seen.add(item.medicineId);
  }
}

export async function submitOrder(
  items: OrderItemInput[],
): Promise<Serialized<OrderDoc>> {
  const session = await requireBuyerAction();
  await connectDb();
  validateItems(items);

  const buyer = await BuyerModel.findById(session.userId);
  // The session could outlive the account being deactivated; re-check.
  if (!buyer || !buyer.active) {
    throw new Error("Apnar account bondho ache");
  }

  const lines = [];
  for (const item of items) {
    const medicine = await MedicineModel.findById(item.medicineId);
    if (!medicine || !medicine.active) throw new Error("Medicine pawa jay ni");
    lines.push({
      medicineId: medicine._id,
      medicineName: medicine.name,
      boxes: item.boxes,
      // Snapshot the box price the buyer is ordering at.
      boxPricePaisa: medicine.boxPricePaisa,
    });
  }

  const order = await OrderModel.create({
    buyerId: buyer._id,
    buyerName: buyer.name,
    buyerShopName: buyer.shopName,
    items: lines,
    status: "pending",
  });

  revalidatePath("/buyer/orders");
  return toPlain(order.toObject());
}

export async function listMyOrders(): Promise<Serialized<OrderDoc>[]> {
  const session = await requireBuyerAction();
  await connectDb();

  const orders = await OrderModel.find({ buyerId: session.userId })
    .sort({ createdAt: -1 })
    .lean<OrderDoc[]>();
  return toPlainList(orders);
}

export async function getMyOrder(
  orderId: string,
): Promise<Serialized<OrderDoc> | null> {
  const session = await requireBuyerAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;

  // Ownership is in the filter: an order that isn't this buyer's simply
  // isn't found, so there is no path that returns another buyer's order.
  const order = await OrderModel.findOne({
    _id: orderId,
    buyerId: session.userId,
  }).lean<OrderDoc>();
  return order ? toPlain(order) : null;
}

export async function cancelMyOrder(orderId: string): Promise<void> {
  const session = await requireBuyerAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }

  // Confirm ownership first, with a message that does not reveal whether the
  // order exists under a different buyer.
  const order = await OrderModel.findOne({
    _id: orderId,
    buyerId: session.userId,
  });
  if (!order) throw new Error("Order pawa jay ni");

  // Only a pending order is cancelable; guard the transition in the filter so
  // a race can't cancel an order the owner is mid-approving.
  const result = await OrderModel.updateOne(
    { _id: orderId, buyerId: session.userId, status: "pending" },
    { $set: { status: "cancelled", resolvedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error("Ei order ar cancel kora jabe na");
  }

  revalidatePath("/buyer/orders");
}
```

- [ ] **Step 4: Add the module to the structural authorization test with a buyer expectation**

`buyerOrders.ts`'s exports reject with `BUYER_ONLY_ERROR`, not `ADMIN_ONLY_ERROR`. The structural test currently asserts `ADMIN_ONLY_ERROR` for every non-exempt export. Teach it a per-module expected error.

In `tests/actions/authorization.test.ts`:

1. Import the buyer error: `import { ADMIN_ONLY_ERROR, BUYER_ONLY_ERROR } from "@/lib/session";`
2. Add `buyerOrders.ts` to the pinned discovery list (keep it sorted):

```typescript
    expect(modulePaths).toEqual([
      "/src/actions/auth.ts",
      "/src/actions/buyerOrders.ts",
      "/src/actions/buyers.ts",
      "/src/actions/dashboard.ts",
      "/src/actions/due.ts",
      "/src/actions/medicines.ts",
      "/src/actions/reports.ts",
      "/src/actions/sales.ts",
      "/src/actions/settings.ts",
      "/src/actions/stock.ts",
    ]);
```

3. Add a per-module expected-error map, defaulting to admin:

```typescript
// Most action modules are admin-only. Buyer-portal modules reject with
// BUYER_ONLY_ERROR instead — same structural guarantee (every export refuses
// an unauthenticated caller before touching its arguments), different role.
const EXPECTED_ERROR: Record<string, string> = {
  "/src/actions/buyerOrders.ts": BUYER_ONLY_ERROR,
};
```

4. In the per-export assertion, use it:

```typescript
      it(`${path} → ${exportName}() rejects an unauthenticated caller`, async () => {
        const fn = value as (...args: unknown[]) => unknown;
        const expected = EXPECTED_ERROR[path] ?? ADMIN_ONLY_ERROR;
        await expect(fn()).rejects.toThrow(expected);
      });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/buyerOrders.test.ts tests/actions/authorization.test.ts`
Expected: PASS. The structural test now holds `buyerOrders.ts` exports to `BUYER_ONLY_ERROR`.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions/buyerOrders.ts tests/actions/buyerOrders.test.ts tests/actions/authorization.test.ts
git commit -m "feat: add buyer order actions with per-action ownership checks"
```

---

### Task 4: Extract the shared wholesale-sale writer

Order approval must create a wholesale sale exactly the way the wholesale form does — same stock deduction, same invoice numbering, same totals. Rather than write that twice (two definitions of "make a sale" is the class of bug that corrupted balances earlier in this project), extract the in-transaction core into one helper both call.

**Files:**
- Create: `src/lib/writeWholesaleSale.ts`
- Modify: `src/actions/sales.ts` (refactor `recordWholesaleSale` to use it)
- Test: `tests/lib/writeWholesaleSale.test.ts`

**Interfaces:**
- Consumes: `applyStockDelta`, `lineTotal`, `computeTotals`, `nextInvoiceSeq`, `formatInvoiceNo`, `boxesToPatas`, `MedicineModel`, `SettingsModel`, `SaleModel`
- Produces:
  - `type WriteWholesaleSaleParams = { session: ClientSession; buyer: { id: mongoose.Types.ObjectId; name: string; shopName: string }; items: { medicineId: string; boxes: number }[]; discountPaisa: number; paidPaisa: number; createdBy: string; orderId?: string | null }`
  - `writeWholesaleSale(params: WriteWholesaleSaleParams): Promise<SaleDoc>` — must be called inside an open transaction; deducts stock, computes totals, assigns an invoice number, creates and returns the `Sale`. Throws the same insufficient-stock message as before.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/writeWholesaleSale.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";

setupTestDb();

const CREATED_BY = new mongoose.Types.ObjectId().toString();

async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
  return medicine;
}

async function run(params: {
  buyer: { id: mongoose.Types.ObjectId; name: string; shopName: string };
  items: { medicineId: string; boxes: number }[];
  discountPaisa?: number;
  paidPaisa?: number;
  orderId?: string | null;
}) {
  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;
  try {
    await session.withTransaction(async () => {
      const sale = await writeWholesaleSale({
        session,
        buyer: params.buyer,
        items: params.items,
        discountPaisa: params.discountPaisa ?? 0,
        paidPaisa: params.paidPaisa ?? 0,
        createdBy: CREATED_BY,
        orderId: params.orderId ?? null,
      });
      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }
  return SaleModel.findById(saleId);
}

const buyer = () => ({
  id: new mongoose.Types.ObjectId(),
  name: "Karim Uddin",
  shopName: "Karim Medical Hall",
});

describe("writeWholesaleSale", () => {
  it("deducts boxes worth of patas and creates a wholesale sale", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 3 }],
      paidPaisa: 0,
    });
    expect(sale!.type).toBe("wholesale");
    expect(sale!.totalPaisa).toBe(36000);
    expect(sale!.items[0].patasDeducted).toBe(30);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);
  });

  it("assigns a sequential invoice number", async () => {
    const medicine = await makeMedicine();
    const line = [{ medicineId: String(medicine._id), boxes: 1 }];
    const first = await run({ buyer: buyer(), items: line });
    const second = await run({ buyer: buyer(), items: line });
    expect(first!.invoiceNo).toBe("ABC-000001");
    expect(second!.invoiceNo).toBe("ABC-000002");
  });

  it("records the paid and due amounts", async () => {
    const medicine = await makeMedicine();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 3 }],
      paidPaisa: 20000,
    });
    expect(sale!.paidPaisa).toBe(20000);
    expect(sale!.duePaisa).toBe(16000);
  });

  it("links the sale to an order when given one", async () => {
    const medicine = await makeMedicine();
    const orderId = new mongoose.Types.ObjectId().toString();
    const sale = await run({
      buyer: buyer(),
      items: [{ medicineId: String(medicine._id), boxes: 1 }],
      orderId,
    });
    expect(String(sale!.orderId)).toBe(orderId);
  });

  it("throws and aborts when stock is short, leaving stock untouched", async () => {
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    await expect(
      run({ buyer: buyer(), items: [{ medicineId: String(medicine._id), boxes: 3 }] }),
    ).rejects.toThrow("stock e ache");
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(25);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("never lets stock go negative", async () => {
    const medicine = await makeMedicine({}, 3);
    await expect(
      run({ buyer: buyer(), items: [{ medicineId: String(medicine._id), boxes: 1000 }] }),
    ).rejects.toThrow();
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts`
Expected: FAIL — cannot resolve `@/lib/writeWholesaleSale`.

- [ ] **Step 3: Write the helper by lifting the in-transaction body out of `recordWholesaleSale`**

Create `src/lib/writeWholesaleSale.ts`. This is the exact code currently inside `recordWholesaleSale`'s `withTransaction` callback, from the per-line loop through `SaleModel.create`, parameterised:

```typescript
import mongoose, { type ClientSession } from "mongoose";
import { boxesToPatas } from "@/lib/units";
import { applyStockDelta } from "@/lib/stockTransaction";
import { lineTotal, computeTotals } from "@/lib/saleTotals";
import { nextInvoiceSeq, formatInvoiceNo } from "@/lib/invoiceNumber";
import { MedicineModel } from "@/models/Medicine";
import { SettingsModel } from "@/models/Settings";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type WriteWholesaleSaleParams = {
  session: ClientSession;
  buyer: { id: mongoose.Types.ObjectId; name: string; shopName: string };
  items: { medicineId: string; boxes: number }[];
  discountPaisa: number;
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
 * applyStockDelta, whose precondition lives in the update filter — a bare
 * $inc would take stock negative (Mongoose min:0 does not run on $inc).
 * Reads are inside the caller's withTransaction so a retry re-evaluates them.
 */
export async function writeWholesaleSale(
  params: WriteWholesaleSaleParams,
): Promise<SaleDoc> {
  const { session } = params;
  const lines = [];

  for (const item of params.items) {
    const medicine = await MedicineModel.findById(item.medicineId).session(
      session,
    );
    if (!medicine) throw new Error("Medicine pawa jay ni");

    const patas = boxesToPatas(item.boxes, medicine.patasPerBox);

    const ok = await applyStockDelta(medicine._id, -patas, session);
    if (!ok) {
      const current = await MedicineModel.findById(item.medicineId).session(
        session,
      );
      throw new Error(
        `${medicine.name} — stock e ache ${current?.stockPatas ?? 0} pata, lagbe ${patas} pata`,
      );
    }

    lines.push({
      medicineId: medicine._id,
      medicineName: medicine.name,
      unit: "box" as const,
      quantity: item.boxes,
      ratePaisa: medicine.boxPricePaisa,
      lineTotalPaisa: lineTotal({
        ratePaisa: medicine.boxPricePaisa,
        quantity: item.boxes,
      }),
      patasDeducted: patas,
    });
  }

  const { subtotalPaisa, totalPaisa, duePaisa } = computeTotals(
    lines.map((l) => ({ ratePaisa: l.ratePaisa, quantity: l.quantity })),
    params.discountPaisa,
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
        invoiceNo: formatInvoiceNo(prefix, seq),
        orderId: params.orderId ?? null,
        items: lines,
        subtotalPaisa,
        discountPaisa: params.discountPaisa,
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

- [ ] **Step 4: Refactor `recordWholesaleSale` to call the helper**

In `src/actions/sales.ts`, replace the body of the `withTransaction` callback in `recordWholesaleSale` (the buyer lookup stays; the per-line loop through `SaleModel.create` is replaced) so it reads:

```typescript
    await session.withTransaction(async () => {
      const buyer = await BuyerModel.findById(input.buyerId).session(session);
      if (!buyer) throw new Error("Buyer pawa jay ni");
      if (!buyer.active) throw new Error("Buyer ta bondho ache");

      const sale = await writeWholesaleSale({
        session,
        buyer: { id: buyer._id, name: buyer.name, shopName: buyer.shopName },
        items: input.items,
        discountPaisa: input.discountPaisa,
        paidPaisa: input.paidPaisa,
        createdBy: adminSession.userId,
        orderId: null,
      });
      saleId = sale._id;
    });
```

Add the import at the top of `sales.ts`: `import { writeWholesaleSale } from "@/lib/writeWholesaleSale";`. Remove any now-unused imports from `sales.ts` (`boxesToPatas`, `applyStockDelta`, `lineTotal`, `nextInvoiceSeq`, `formatInvoiceNo`, `SettingsModel` may no longer be used by `recordWholesaleSale` — but check whether `recordRetailSale`/`cancelSale`/`getSale` still use them before removing; `applyStockDelta` and `lineTotal` and `computeTotals` are still used by retail and cancellation, so leave those). Let `tsc` tell you what is genuinely unused.

- [ ] **Step 5: Run the wholesale-sale tests to prove the refactor is behaviour-preserving**

Run: `npx vitest run tests/lib/writeWholesaleSale.test.ts tests/actions/sales.test.ts`
Expected: PASS. Every existing `sales.test.ts` assertion must still pass unchanged — that is what proves the extraction didn't change behaviour. If any sales test needs editing to pass, stop: the refactor changed behaviour and is wrong.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, and `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/writeWholesaleSale.ts src/actions/sales.ts tests/lib/writeWholesaleSale.test.ts
git commit -m "refactor: extract the shared wholesale-sale transaction writer"
```

---

### Task 5: Admin order actions — approve and reject

**Files:**
- Create: `src/actions/adminOrders.ts`
- Modify: `tests/actions/authorization.test.ts`
- Test: `tests/actions/adminOrders.test.ts`

**Interfaces:**
- Consumes: `requireAdminAction`, `writeWholesaleSale`, `OrderModel`, `SaleModel`, `toPlain`/`toPlainList`
- Produces:
  - `type ApprovalItemInput = { medicineId: string; boxes: number }`
  - `listPendingOrders(): Promise<Serialized<OrderDoc>[]>` — oldest first (FIFO)
  - `getOrderForAdmin(orderId: string): Promise<Serialized<OrderDoc> | null>`
  - `approveOrder(orderId: string, items: ApprovalItemInput[]): Promise<Serialized<SaleDoc>>`
  - `rejectOrder(orderId: string, reason: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/adminOrders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import {
  listPendingOrders,
  getOrderForAdmin,
  approveOrder,
  rejectOrder,
} from "@/actions/adminOrders";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";
import { SaleModel } from "@/models/Sale";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

async function makeBuyer(overrides = {}) {
  return BuyerModel.create({
    name: "Karim Uddin",
    shopName: "Karim Medical Hall",
    phone: `017${Math.floor(Math.random() * 100000000)}`,
    address: "Mirpur",
    passwordHash: "x",
    active: true,
    ...overrides,
  });
}

async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
  return medicine;
}

async function makeOrder(
  buyerId: mongoose.Types.ObjectId,
  medicine: { _id: mongoose.Types.ObjectId; name: string; boxPricePaisa: number },
  boxes = 3,
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
        boxPricePaisa: medicine.boxPricePaisa,
      },
    ],
    status: "pending",
  });
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("listPendingOrders", () => {
  it("returns pending orders oldest first, excluding resolved ones", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const first = await makeOrder(buyer._id, medicine);
    const second = await makeOrder(buyer._id, medicine);
    await OrderModel.updateOne({ _id: second._id }, { $set: { status: "approved" } });

    const pending = await listPendingOrders();
    expect(pending).toHaveLength(1);
    expect(pending[0]._id).toBe(String(first._id));
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(listPendingOrders()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("approveOrder", () => {
  it("turns a pending order into a fully-unpaid wholesale sale and links them", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);

    const sale = await approveOrder(String(order._id), [
      { medicineId: String(medicine._id), boxes: 3 },
    ]);

    expect(sale.type).toBe("wholesale");
    expect(sale.totalPaisa).toBe(36000);
    expect(sale.paidPaisa).toBe(0);
    expect(sale.duePaisa).toBe(36000);
    expect(String(sale.orderId)).toBe(String(order._id));

    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("approved");
    expect(String(after!.saleId)).toBe(sale._id);
    expect(after!.resolvedAt).toBeInstanceOf(Date);

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);
  });

  it("lets the owner approve fewer boxes than were ordered", async () => {
    // Buyer ordered 10, only 6 in stock: approve 6.
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({}, 60); // 6 boxes
    const order = await makeOrder(buyer._id, medicine, 10);

    const sale = await approveOrder(String(order._id), [
      { medicineId: String(medicine._id), boxes: 6 },
    ]);
    expect(sale.items[0].quantity).toBe(6);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(0);
    // The order preserves what the buyer originally asked for.
    expect((await OrderModel.findById(order._id))!.items[0].boxes).toBe(10);
  });

  it("refuses an item not in the order", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const other = await makeMedicine({ name: "Ace" });
    const order = await makeOrder(buyer._id, medicine, 3);

    await expect(
      approveOrder(String(order._id), [{ medicineId: String(other._id), boxes: 1 }]),
    ).rejects.toThrow("Order er baire er medicine");
  });

  it("aborts when stock is short and leaves the order pending, stock intact, no invoice consumed", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    const order = await makeOrder(buyer._id, medicine, 3);

    await expect(
      approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 3 }]),
    ).rejects.toThrow("stock e ache");

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(25);
    expect((await OrderModel.findById(order._id))!.status).toBe("pending");
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("cannot approve an order twice", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 1);

    await approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }]);
    await expect(
      approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }]),
    ).rejects.toThrow("Ei order ar approve kora jabe na");

    // Stock only dropped once.
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(490);
    expect(await SaleModel.countDocuments()).toBe(1);
  });

  it("rejects an empty approval", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);
    await expect(approveOrder(String(order._id), [])).rejects.toThrow("Cart khali");
  });

  it("rejects an unknown order", async () => {
    await expect(
      approveOrder("507f1f77bcf86cd799439011", []),
    ).rejects.toThrow("Order pawa jay ni");
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(approveOrder("507f1f77bcf86cd799439011", [])).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

describe("rejectOrder", () => {
  it("marks a pending order rejected with a reason and creates no sale", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);

    await rejectOrder(String(order._id), "Stock nai");
    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("rejected");
    expect(after!.rejectReason).toBe("Stock nai");
    expect(after!.resolvedAt).toBeInstanceOf(Date);
    expect(await SaleModel.countDocuments()).toBe(0);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("requires a reason", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);
    await expect(rejectOrder(String(order._id), "  ")).rejects.toThrow(
      "Reject korar karon likhte hobe",
    );
  });

  it("cannot reject an already-approved order", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 1);
    await approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }]);
    await expect(rejectOrder(String(order._id), "too late")).rejects.toThrow(
      "Ei order ar reject kora jabe na",
    );
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(rejectOrder("507f1f77bcf86cd799439011", "x")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/actions/adminOrders.test.ts`
Expected: FAIL — cannot resolve `@/actions/adminOrders`.

- [ ] **Step 3: Write the actions**

Create `src/actions/adminOrders.ts`:

```typescript
"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { OrderModel, type OrderDoc } from "@/models/Order";
import { SaleModel, type SaleDoc } from "@/models/Sale";

export type ApprovalItemInput = { medicineId: string; boxes: number };

export async function listPendingOrders(): Promise<Serialized<OrderDoc>[]> {
  await requireAdminAction();
  await connectDb();

  // Oldest first: the owner works the queue front to back.
  const orders = await OrderModel.find({ status: "pending" })
    .sort({ createdAt: 1 })
    .lean<OrderDoc[]>();
  return toPlainList(orders);
}

export async function getOrderForAdmin(
  orderId: string,
): Promise<Serialized<OrderDoc> | null> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;
  const order = await OrderModel.findById(orderId).lean<OrderDoc>();
  return order ? toPlain(order) : null;
}

function validateApproval(items: ApprovalItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart khali");
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 1
    ) {
      throw new Error("Box sonkha 1 er kom hote parbe na");
    }
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi dewa jabe na");
    }
    seen.add(item.medicineId);
  }
}

/**
 * Approves a pending order into a wholesale sale. The owner may reduce
 * quantities or drop lines (a buyer ordered 10 boxes; only 6 are in stock —
 * approve 6), but may not introduce a medicine the buyer never ordered.
 *
 * Stock deduction, invoice numbering, and the sale itself go through the same
 * writeWholesaleSale used by the wholesale form, so an order-sourced sale is
 * identical to a form-sourced one. The order's status flip is in the same
 * transaction, guarded in the filter so an order can't be approved twice.
 */
export async function approveOrder(
  orderId: string,
  items: ApprovalItemInput[],
): Promise<Serialized<SaleDoc>> {
  const adminSession = await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }
  validateApproval(items);

  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw new Error("Order pawa jay ni");
      if (order.status !== "pending") {
        throw new Error("Ei order ar approve kora jabe na");
      }

      // Every approved line must have been in the order — the owner adjusts
      // quantities, he does not add products the buyer never asked for.
      const ordered = new Set(order.items.map((line) => String(line.medicineId)));
      for (const item of items) {
        if (!ordered.has(item.medicineId)) {
          throw new Error("Order er baire er medicine dewa jabe na");
        }
      }

      const sale = await writeWholesaleSale({
        session,
        buyer: {
          id: order.buyerId,
          name: order.buyerName,
          shopName: order.buyerShopName,
        },
        items,
        discountPaisa: 0,
        // The buyer pays nothing at order time; it is all due, collected
        // later through the Baki Khata.
        paidPaisa: 0,
        createdBy: adminSession.userId,
        orderId: String(order._id),
      });

      // Guard the transition in the filter so a concurrent approval can't
      // also pass and create a second sale.
      const flipped = await OrderModel.updateOne(
        { _id: order._id, status: "pending" },
        {
          $set: {
            status: "approved",
            saleId: sale._id,
            resolvedAt: new Date(),
          },
        },
        { session },
      );
      if (flipped.matchedCount === 0) {
        throw new Error("Ei order ar approve kora jabe na");
      }

      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/orders");
  revalidatePath("/medicines");
  revalidatePath("/due");

  const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
  return toPlain(sale!);
}

export async function rejectOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("Reject korar karon likhte hobe");
  }

  const result = await OrderModel.updateOne(
    { _id: orderId, status: "pending" },
    { $set: { status: "rejected", rejectReason: reason.trim(), resolvedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    // Either the order doesn't exist or it isn't pending any more.
    const exists = await OrderModel.exists({ _id: orderId });
    throw new Error(exists ? "Ei order ar reject kora jabe na" : "Order pawa jay ni");
  }

  revalidatePath("/orders");
}
```

- [ ] **Step 4: Add the module to the structural authorization test**

In `tests/actions/authorization.test.ts`, add `"/src/actions/adminOrders.ts"` to the pinned `modulePaths` list (sorted — it goes right after `auth.ts`, before `buyerOrders.ts`). It is admin-guarded, so it needs no `EXPECTED_ERROR` entry (the default is `ADMIN_ONLY_ERROR`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/adminOrders.test.ts tests/actions/authorization.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test` — expected PASS. `npx tsc --noEmit` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/actions/adminOrders.ts tests/actions/adminOrders.test.ts tests/actions/authorization.test.ts
git commit -m "feat: add order approval and rejection"
```

---

### Task 6: Buyer portal screens

**Files:**
- Create: `src/app/buyer/login/page.tsx`
- Create: `src/app/(buyer)/layout.tsx`
- Create: `src/app/(buyer)/buyer/page.tsx` (medicine browse + cart + submit)
- Create: `src/app/(buyer)/buyer/orders/page.tsx` (my orders)
- Create: `src/app/(buyer)/buyer/account/page.tsx` (my balance + payments)
- Create: `src/components/BuyerNav.tsx`
- Create: `src/components/BuyerBrowse.tsx`
- Create: `src/components/BuyerOrderList.tsx`

**Interfaces:**
- Consumes: `buyerLogin`, `buyerLogout`, `requireBuyer`, `submitOrder`, `listMyOrders`, `cancelMyOrder`, `searchMedicines`, `readSettings`, `describeDue`, `formatTaka`, `formatDhakaDate`
- Produces: `myDueBalance()`, `myLedger()` in `buyerOrders.ts` (Step 7), `src/lib/dueComputation.ts` (`computeBuyerDue`, `loadBuyerLedger`), and a working buyer portal under `/buyer`

**Route-group note:** `(buyer)` is a route group (parentheses = not in the URL). Its `layout.tsx` calls `requireBuyer()` and renders `BuyerNav`, guarding every page beneath it — the same shape as `(admin)/layout.tsx`. `/buyer/login` lives **outside** the group (at `src/app/buyer/login/`) so it is reachable without a session, exactly as `/login` sits outside `(admin)`. Read `src/app/(admin)/layout.tsx` and `src/app/login/page.tsx` first and mirror them.

- [ ] **Step 1: Write the buyer login page**

Create `src/app/buyer/login/page.tsx`. Mirror `src/app/login/page.tsx` exactly, changing: the action to `buyerLogin`, the fields to phone + password, the redirect target to `/buyer`, and the strings to Banglish.

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buyerLogin } from "@/actions/auth";

export default function BuyerLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await buyerLogin(phone, password);
    if (result.ok) {
      router.push("/buyer");
      router.refresh();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Buyer Login</h1>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-sm text-slate-700">Phone</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)}
            autoComplete="username" required
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-slate-700">Password</label>
          <input id="password" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required
            className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Login"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Write the buyer nav**

Create `src/components/BuyerNav.tsx`:

```typescript
import Link from "next/link";
import { buyerLogout } from "@/actions/auth";

const LINKS = [
  { href: "/buyer", label: "Order dao" },
  { href: "/buyer/orders", label: "Amar order" },
  { href: "/buyer/account", label: "Amar hisab" },
];

export function BuyerNav({ pharmacyName, buyerName }: { pharmacyName: string; buyerName: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
        <span className="font-semibold text-teal-800">{pharmacyName}</span>
        <nav className="ml-auto flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}
              className="text-slate-600 hover:text-teal-700">
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-slate-400">{buyerName}</span>
        <form action={buyerLogout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write the buyer layout**

Create `src/app/(buyer)/layout.tsx`:

```typescript
import { requireBuyer } from "@/lib/session";
import { readSettings } from "@/actions/settings";
import { BuyerNav } from "@/components/BuyerNav";

export default async function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBuyer();
  const settings = await readSettings();

  return (
    <div className="min-h-screen bg-slate-50">
      <BuyerNav pharmacyName={settings.pharmacyName} buyerName={session.name} />
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Write the browse-and-order component**

Create `src/components/BuyerBrowse.tsx`. It reuses `MedicinePicker` but must show **only** name and box rate — never stock or the pata price. `MedicinePicker` shows stock in its dropdown, so it is **not** suitable here; instead build a small self-contained search that calls `searchMedicines` and renders only name + box rate. (Do not modify `MedicinePicker`.)

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchMedicines } from "@/actions/medicines";
import { submitOrder } from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";

type Pick = { id: string; name: string; boxPricePaisa: number };
type CartLine = { medicine: Pick; boxes: number };

export function BuyerBrowse() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchMedicines(query);
        if (cancelled) return;
        // Deliberately drop stock and pata price — a buyer sees neither.
        setResults(
          found.map((m) => ({
            id: String(m._id),
            name: m.name,
            boxPricePaisa: m.boxPricePaisa,
          })),
        );
      } catch {
        if (!cancelled) setError("Medicine khoja jacche na, abar chesta koro");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function add(medicine: Pick) {
    setDone("");
    setCart((current) => {
      const existing = current.find((l) => l.medicine.id === medicine.id);
      if (existing) {
        return current.map((l) =>
          l.medicine.id === medicine.id ? { ...l, boxes: l.boxes + 1 } : l,
        );
      }
      return [...current, { medicine, boxes: 1 }];
    });
    setQuery("");
    setResults([]);
  }

  const total = cart.reduce((sum, l) => sum + l.medicine.boxPricePaisa * l.boxes, 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      await submitOrder(cart.map((l) => ({ medicineId: l.medicine.id, boxes: l.boxes })));
      setDone("Order pathano hoyeche. Malik approve korle janiye deya hobe.");
      setCart([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h1 className="mb-3 font-semibold text-slate-900">Order dao</h1>
        <div className="relative">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Medicine er nam likho..." className={field} />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => add(m)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="font-medium text-slate-900">{m.name}</span>
                    <span className="text-slate-600">{formatTaka(m.boxPricePaisa)}/box</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Medicine</th>
                <th className="p-3">Box rate</th>
                <th className="p-3">Koto box</th>
                <th className="p-3">Total</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.medicine.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium text-slate-900">{line.medicine.name}</td>
                  <td className="p-3">{formatTaka(line.medicine.boxPricePaisa)}</td>
                  <td className="p-3">
                    <input type="number" min={1} value={line.boxes}
                      onChange={(e) =>
                        setCart((current) =>
                          current.map((l) =>
                            l.medicine.id === line.medicine.id
                              ? { ...l, boxes: Number(e.target.value) }
                              : l,
                          ),
                        )
                      }
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                  </td>
                  <td className="p-3 font-medium">
                    {formatTaka(line.medicine.boxPricePaisa * line.boxes)}
                  </td>
                  <td className="p-3 text-right">
                    <button type="button"
                      onClick={() =>
                        setCart((current) => current.filter((l) => l.medicine.id !== line.medicine.id))
                      }
                      className="text-slate-400 hover:text-red-600">Bad dao</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-200 p-4">
            <span className="text-slate-600">Mot</span>
            <span className="text-lg font-semibold">{formatTaka(total)}</span>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">{done}</p>}

      {cart.length > 0 && (
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal-700 px-6 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Order pathao"}
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Write the browse page**

Create `src/app/(buyer)/buyer/page.tsx`:

```typescript
import { BuyerBrowse } from "@/components/BuyerBrowse";

export default function BuyerHomePage() {
  return <BuyerBrowse />;
}
```

- [ ] **Step 6: Write the my-orders component and page**

Create `src/components/BuyerOrderList.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/actions/buyerOrders";
import { formatTaka } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approve hoyeche",
  rejected: "Reject hoyeche",
  cancelled: "Cancel kora",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-teal-700",
  rejected: "text-red-600",
  cancelled: "text-slate-400",
};

export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  rejectReason: string;
  items: { medicineName: string; boxes: number; boxPricePaisa: number }[];
};

export function BuyerOrderList({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setError("");
    setCancellingId(id);
    try {
      await cancelMyOrder(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setCancellingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="mb-3 text-lg font-semibold text-slate-900">Amar order</h1>
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Ekhono kono order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Amar order</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * i.boxes,
          0,
        );
        return (
          <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {new Date(order.createdAt).toLocaleDateString("en-GB", {
                  timeZone: "Asia/Dhaka",
                })}
              </span>
              <span className={`text-sm font-medium ${STATUS_CLASS[order.status]}`}>
                {STATUS_LABEL[order.status]}
              </span>
            </div>

            <ul className="mt-2 text-sm text-slate-700">
              {order.items.map((item, i) => (
                <li key={i} className="flex justify-between">
                  <span>{item.medicineName} × {item.boxes} box</span>
                  <span>{formatTaka(item.boxPricePaisa * item.boxes)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="text-sm font-medium">Mot {formatTaka(total)}</span>
              {order.status === "pending" && (
                <button onClick={() => handleCancel(order.id)}
                  disabled={cancellingId === order.id}
                  className="text-sm text-slate-500 hover:text-red-600 disabled:opacity-50">
                  Cancel koro
                </button>
              )}
            </div>

            {order.status === "rejected" && order.rejectReason && (
              <p className="mt-2 text-xs text-red-600">Karon: {order.rejectReason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Create `src/app/(buyer)/buyer/orders/page.tsx`:

```typescript
import { listMyOrders } from "@/actions/buyerOrders";
import { BuyerOrderList, type OrderRow } from "@/components/BuyerOrderList";

export default async function MyOrdersPage() {
  const orders = await listMyOrders();

  const rows: OrderRow[] = orders.map((o) => ({
    id: o._id,
    createdAt: o.createdAt,
    status: o.status,
    rejectReason: o.rejectReason,
    items: o.items.map((i) => ({
      medicineName: i.medicineName,
      boxes: i.boxes,
      boxPricePaisa: i.boxPricePaisa,
    })),
  }));

  return <BuyerOrderList orders={rows} />;
}
```

- [ ] **Step 7: Extract the due computation, then add buyer-scoped reads**

The account page needs the buyer's own balance and ledger, but `buyerDueBalance`/`buyerLedger` in `src/actions/due.ts` are admin-guarded — calling them from a buyer page throws `ADMIN_ONLY_ERROR`. The buyer needs its own reads, scoped to the session (never taking a buyer-id argument, so one buyer can't read another's ledger). And the balance/ledger math must stay a single definition, not be copied.

First, extract the computation into a non-action library so both `due.ts` and the new buyer reads share it (a plain helper exported from an `src/actions/*.ts` module would be swept by the structural authorization test and wrongly required to reject callers — so it must live under `src/lib/`).

Create `src/lib/dueComputation.ts` by lifting the bodies of `due.ts`'s non-exported `computeBuyerDueBalance` and the query inside `buyerLedger`:

```typescript
import mongoose from "mongoose";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { PaymentModel, type PaymentDoc } from "@/models/Payment";

/**
 * A buyer's signed outstanding balance in paisa: positive = the buyer owes,
 * negative = the pharmacy owes him credit. Derived from active wholesale
 * sales and payments — never stored. Cancelled sales are excluded (their due
 * is no longer owed) but their prior payments still count, which is what
 * produces a credit. This is the single definition; both the admin due
 * ledger and the buyer's own account read call it.
 */
export async function computeBuyerDue(buyerId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(buyerId)) return 0;
  const id = new mongoose.Types.ObjectId(buyerId);

  const [saleAgg] = await SaleModel.aggregate<{ total: number }>([
    { $match: { buyerId: id, type: "wholesale", status: "active" } },
    { $group: { _id: null, total: { $sum: "$duePaisa" } } },
  ]);
  const [payAgg] = await PaymentModel.aggregate<{ total: number }>([
    { $match: { buyerId: id } },
    { $group: { _id: null, total: { $sum: "$amountPaisa" } } },
  ]);

  return (saleAgg?.total ?? 0) - (payAgg?.total ?? 0);
}

/** A buyer's wholesale sales and payments, newest first — the raw docs. */
export async function loadBuyerLedger(
  buyerId: string,
): Promise<{ sales: SaleDoc[]; payments: PaymentDoc[] }> {
  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    return { sales: [], payments: [] };
  }
  const id = new mongoose.Types.ObjectId(buyerId);

  const [sales, payments] = await Promise.all([
    SaleModel.find({ buyerId: id, type: "wholesale" })
      .sort({ createdAt: -1 })
      .lean<SaleDoc[]>(),
    PaymentModel.find({ buyerId: id })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc[]>(),
  ]);
  return { sales, payments };
}
```

Then refactor `src/actions/due.ts` so `buyerDueBalance`, `listBuyerDues`, and `buyerLedger` call `computeBuyerDue` / `loadBuyerLedger` instead of their inline copies. **Every existing `due.test.ts` assertion must still pass unchanged** — that is what proves the extraction preserved behaviour. If a due test needs editing, stop; the refactor changed behaviour. Create `tests/lib/dueComputation.test.ts` with a couple of direct tests (a buyer with an unpaid sale shows a positive balance; a cancelled fully-paid sale yields a negative/credit balance) using `setupTestDb()`.

Now add the buyer-scoped reads to `src/actions/buyerOrders.ts`:

```typescript
import { computeBuyerDue, loadBuyerLedger } from "@/lib/dueComputation";
import { type PaymentDoc } from "@/models/Payment";
import { type SaleDoc } from "@/models/Sale";

export async function myDueBalance(): Promise<number> {
  const session = await requireBuyerAction();
  await connectDb();
  // The buyer id comes from the session, never a parameter — a buyer can
  // only ever read his own balance.
  return computeBuyerDue(session.userId);
}

export async function myLedger(): Promise<{
  sales: Serialized<SaleDoc>[];
  payments: Serialized<PaymentDoc>[];
}> {
  const session = await requireBuyerAction();
  await connectDb();
  const { sales, payments } = await loadBuyerLedger(session.userId);
  return { sales: toPlainList(sales), payments: toPlainList(payments) };
}
```

Add tests to `tests/actions/buyerOrders.test.ts`: `myDueBalance`/`myLedger` return only the session buyer's data (seed a second buyer with a sale and confirm it never appears); both reject an admin caller and an unauthenticated one with `BUYER_ONLY_ERROR`. The structural authorization test already maps `buyerOrders.ts` to `BUYER_ONLY_ERROR`, so these new exports are covered automatically.

- [ ] **Step 8: Write the my-account page**

Create `src/app/(buyer)/buyer/account/page.tsx`. It shows the buyer's own signed balance (via `describeDue`) and payment history, reading through the buyer-scoped `myDueBalance`/`myLedger` — never the admin `due` actions.

```typescript
import { myDueBalance, myLedger } from "@/actions/buyerOrders";
import { describeDue } from "@/lib/dueDisplay";
import { formatTaka } from "@/lib/money";
import { formatDhakaDate } from "@/lib/dhakaDate";

export default async function BuyerAccountPage() {
  const [duePaisa, ledger] = await Promise.all([myDueBalance(), myLedger()]);
  const due = describeDue(duePaisa);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Amar hisab</h1>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="text-xs text-slate-500">{due.label}</div>
        <div className={`text-2xl font-semibold ${due.className}`}>{due.amountText}</div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Bikri</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Invoice</th>
                <th className="p-3 text-right">Mot</th>
                <th className="p-3 text-right">Baki</th>
              </tr>
            </thead>
            <tbody>
              {ledger.sales.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">Kono bikri nai.</td></tr>
              )}
              {ledger.sales.map((sale) => (
                <tr key={sale._id} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">{formatDhakaDate(sale.createdAt)}</td>
                  <td className="p-3">
                    {sale.invoiceNo}
                    {sale.status === "cancelled" && (
                      <span className="ml-2 text-xs text-red-600">Cancelled</span>
                    )}
                  </td>
                  <td className="p-3 text-right">{formatTaka(sale.totalPaisa)}</td>
                  <td className={`p-3 text-right ${sale.status === "cancelled" ? "text-slate-400 line-through" : ""}`}>
                    {formatTaka(sale.duePaisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Joma</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Taka</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger.payments.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-slate-400">Kono joma nai.</td></tr>
              )}
              {ledger.payments.map((payment) => (
                <tr key={payment._id} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">{formatDhakaDate(payment.createdAt)}</td>
                  <td className="p-3 text-right text-teal-700">{formatTaka(payment.amountPaisa)}</td>
                  <td className="p-3 text-slate-500">{payment.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Verify the whole portal in the browser**

The live Atlas holds the owner's real data (buyer "Afnan", medicine "Napa", sale `ABC-000001`). **Do not delete or modify it.** You can log in as Afnan if you know the password; if not, create a clearly-named scratch buyer with a known password, exercise the flow, then remove exactly what you created. Do not edit or print `.env`/`.env.local`.

Run `npm run dev`. At `/buyer/login`:
- Wrong phone/password → "Phone ba password bhul", no login
- Correct → lands on `/buyer`, nav shows the pharmacy name and the buyer's name
- Search a medicine → only name and box rate appear (confirm **no stock, no pata price** is shown anywhere)
- Add to cart, adjust boxes, submit → success message, cart clears
- `/buyer/orders` → the order shows as Pending; cancel it → status becomes Cancel kora
- `/buyer/account` → the buyer's balance and any invoices/payments; confirm the balance matches what the owner's `/due` shows for the same buyer
- Try visiting `/dashboard` (an admin route) while logged in as a buyer → redirected to `/buyer/login`, never shown admin data
- **Remove any scratch buyer and scratch orders you created.**

- [ ] **Step 10: Run the whole suite and commit**

Run: `npm test` — PASS. `npx tsc --noEmit` — clean. `npm run build` — success.

```bash
git add "src/app/buyer" "src/app/(buyer)" src/components/BuyerNav.tsx src/components/BuyerBrowse.tsx src/components/BuyerOrderList.tsx src/actions/buyerOrders.ts tests/actions/buyerOrders.test.ts
git commit -m "feat: add the buyer portal screens"
```

---

### Task 7: Admin pending-orders screen and dashboard count

**Files:**
- Create: `src/app/(admin)/orders/page.tsx`
- Create: `src/components/PendingOrders.tsx`
- Modify: `src/components/AdminNav.tsx`
- Modify: `src/actions/dashboard.ts`
- Modify: `src/components/DashboardCards.tsx`
- Modify: `tests/actions/dashboard.test.ts`

**Interfaces:**
- Consumes: `listPendingOrders`, `approveOrder`, `rejectOrder` (Task 5), `OrderModel`, `formatTaka`, `formatDhakaDateTime`
- Produces: `/orders` admin screen; a `pendingOrderCount` field on `DashboardSummary`; a nav link

- [ ] **Step 1: Add `pendingOrderCount` to the dashboard — write the failing test first**

Append to `tests/actions/dashboard.test.ts` (it already has `makeSale`/`makeMedicine` helpers, `vi.useFakeTimers`, and an admin session in `beforeEach`; add an `OrderModel` import and a small helper):

```typescript
import { OrderModel } from "@/models/Order";

async function makePendingOrder() {
  return OrderModel.create({
    buyerId: new mongoose.Types.ObjectId(),
    buyerName: "Karim",
    items: [{ medicineId: MEDICINE_ID, medicineName: "Napa", boxes: 1, boxPricePaisa: 12000 }],
    status: "pending",
  });
}

describe("dashboardSummary — pending orders", () => {
  it("counts only pending orders", async () => {
    await makePendingOrder();
    await makePendingOrder();
    const resolved = await makePendingOrder();
    await OrderModel.updateOne({ _id: resolved._id }, { $set: { status: "approved" } });

    const summary = await dashboardSummary();
    expect(summary.pendingOrderCount).toBe(2);
  });

  it("is zero when there are no pending orders", async () => {
    expect((await dashboardSummary()).pendingOrderCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/actions/dashboard.test.ts`
Expected: FAIL — `pendingOrderCount` is missing.

- [ ] **Step 3: Add the field to `dashboardSummary`**

In `src/actions/dashboard.ts`: add `pendingOrderCount: number;` to the `DashboardSummary` type, import `OrderModel`, add `OrderModel.countDocuments({ status: "pending" })` to the `Promise.all`, and return it. Keep the Dhaka-day and split-total logic untouched.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/actions/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Show the count on the dashboard**

In `src/components/DashboardCards.tsx`, add a card (a `Link` to `/orders`) shown only when `summary.pendingOrderCount > 0`:

```typescript
      {summary.pendingOrderCount > 0 && (
        <Link href="/orders" className="rounded-xl bg-amber-50 p-4 shadow-sm hover:bg-amber-100">
          <div className="text-xs text-amber-700">Pending order</div>
          <div className="text-2xl font-semibold text-amber-900">
            {summary.pendingOrderCount}
          </div>
          <div className="mt-1 text-xs text-amber-700">ta approve korar opekkhay</div>
        </Link>
      )}
```

Place it in the existing card grid.

- [ ] **Step 6: Write the pending-orders screen**

Create `src/components/PendingOrders.tsx` — a client component listing each pending order with editable box quantities, an Approve button (calls `approveOrder(orderId, items)` and on success navigates to the resulting invoice), and a Reject button with a reason prompt (calls `rejectOrder`). Follow the established error pattern (`role="alert"`, `busy`, Banglish fallback). Approve builds `items` from the current (possibly reduced) box inputs, dropping any line set to 0.

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveOrder, rejectOrder } from "@/actions/adminOrders";
import { formatTaka } from "@/lib/money";
import { formatDhakaDateTime } from "@/lib/dhakaDate";

export type PendingOrderRow = {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerShopName: string;
  items: { medicineId: string; medicineName: string; boxes: number; boxPricePaisa: number }[];
};

export function PendingOrders({ orders }: { orders: PendingOrderRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Editable box quantities, keyed by orderId → medicineId → boxes.
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(
      orders.map((o) => [
        o.id,
        Object.fromEntries(o.items.map((i) => [i.medicineId, i.boxes])),
      ]),
    ),
  );

  function setBoxes(orderId: string, medicineId: string, boxes: number) {
    setEdits((current) => ({
      ...current,
      [orderId]: { ...current[orderId], [medicineId]: boxes },
    }));
  }

  async function handleApprove(order: PendingOrderRow) {
    setError("");
    setBusyId(order.id);
    try {
      const items = order.items
        .map((i) => ({ medicineId: i.medicineId, boxes: edits[order.id]?.[i.medicineId] ?? i.boxes }))
        .filter((i) => i.boxes > 0);
      const sale = await approveOrder(order.id, items);
      router.push(`/invoice/${sale._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusyId(null);
    }
  }

  async function handleReject(order: PendingOrderRow) {
    const reason = window.prompt("Reject korar karon:");
    if (reason === null) return;
    setError("");
    setBusyId(order.id);
    try {
      await rejectOrder(order.id, reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusyId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="mb-3 text-lg font-semibold text-slate-900">Pending Order</h1>
        <p className="rounded-xl bg-white p-6 text-center text-slate-400 shadow-sm">
          Kono pending order nai.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Pending Order</h1>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {orders.map((order) => {
        const total = order.items.reduce(
          (sum, i) => sum + i.boxPricePaisa * (edits[order.id]?.[i.medicineId] ?? i.boxes),
          0,
        );
        return (
          <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900">{order.buyerName}</div>
                <div className="text-xs text-slate-500">{order.buyerShopName}</div>
              </div>
              <span className="text-xs text-slate-500">{formatDhakaDateTime(order.createdAt)}</span>
            </div>

            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1">Medicine</th>
                  <th className="py-1">Box rate</th>
                  <th className="py-1">Order</th>
                  <th className="py-1">Approve koto box</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const boxes = edits[order.id]?.[item.medicineId] ?? item.boxes;
                  return (
                    <tr key={item.medicineId} className="border-t border-slate-100">
                      <td className="py-2 font-medium text-slate-900">{item.medicineName}</td>
                      <td className="py-2">{formatTaka(item.boxPricePaisa)}</td>
                      <td className="py-2 text-slate-500">{item.boxes}</td>
                      <td className="py-2">
                        <input type="number" min={0} value={boxes}
                          onChange={(e) => setBoxes(order.id, item.medicineId, Number(e.target.value))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1" />
                      </td>
                      <td className="py-2 text-right">{formatTaka(item.boxPricePaisa * boxes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-medium">Mot {formatTaka(total)}</span>
              <div className="flex gap-2">
                <button onClick={() => handleReject(order)} disabled={busyId === order.id}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Reject
                </button>
                <button onClick={() => handleApprove(order)} disabled={busyId === order.id}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {busyId === order.id ? "Wait..." : "Approve ar invoice"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

Note: `window.prompt` is used for the reject reason to keep the component small. It does not trigger a blocking browser dialog problem in normal use; if the reviewer prefers an inline field, that is an acceptable substitution as long as the reason stays required.

- [ ] **Step 7: Write the page and nav link**

Create `src/app/(admin)/orders/page.tsx`:

```typescript
import { listPendingOrders } from "@/actions/adminOrders";
import { PendingOrders, type PendingOrderRow } from "@/components/PendingOrders";

export default async function OrdersPage() {
  const orders = await listPendingOrders();

  const rows: PendingOrderRow[] = orders.map((o) => ({
    id: o._id,
    createdAt: o.createdAt,
    buyerName: o.buyerName,
    buyerShopName: o.buyerShopName,
    items: o.items.map((i) => ({
      medicineId: String(i.medicineId),
      medicineName: i.medicineName,
      boxes: i.boxes,
      boxPricePaisa: i.boxPricePaisa,
    })),
  }));

  return <PendingOrders orders={rows} />;
}
```

In `src/components/AdminNav.tsx`, add a "Pending Order" link — put it after "Wholesale Bikri":

```typescript
  { href: "/orders", label: "Pending Order" },
```

- [ ] **Step 8: Verify in the browser**

Run `npm run dev`. Log in as admin. Using a scratch buyer (created via the buyer screen or a script), place a pending order, then:
- `/dashboard` shows the "Pending order" card with the count
- `/orders` lists the order with editable box quantities
- Reduce a quantity and Approve → lands on the printable invoice; `/medicines` shows stock dropped by the approved amount; `/due` shows the buyer owing the sale total
- Place another order and Reject with a reason → it leaves the pending list, no sale created, stock unchanged
- Confirm an approved order's sale appears in `/reports` for today exactly like a wholesale sale from the form
- **Remove the scratch buyer, orders, and any resulting test sales when done** — but do not touch the owner's real `ABC-000001` / Napa / Afnan data.

- [ ] **Step 9: Run the whole suite and commit**

Run: `npm test` — PASS. `npx tsc --noEmit` — clean. `npm run build` — success.

```bash
git add "src/app/(admin)/orders" src/components/PendingOrders.tsx src/components/AdminNav.tsx src/actions/dashboard.ts src/components/DashboardCards.tsx tests/actions/dashboard.test.ts
git commit -m "feat: add pending-orders screen and dashboard order count"
```

---

## Done when

- A buyer logs in with phone + password, browses at box rate (no stock, no pata price), and submits an order that appears pending on the owner's side
- The owner approves it (reducing quantities if stock is short), stock drops, an invoice is created, and it appears in reports and the due ledger exactly like a wholesale sale from the form
- The owner rejects an order with a reason, creating no sale
- A buyer cancels his own pending order, and cannot cancel an approved one or read/cancel another buyer's order
- Stock never goes negative through approval; no invoice number is reused; an order can't be approved twice
- The dashboard shows the pending-order count
- Every buyer action rejects a non-buyer and rejects a buyer touching another buyer's data; the structural authorization test covers the new modules
- `npm test` passes, `tsc --noEmit` is clean, `npm run build` succeeds

## Deliberately not in this plan

- Everything in the base spec's non-goals: purchase entry with cost price, profit reporting, expiry/batch tracking, expense entry, per-buyer pricing, staff accounts, retail receipt printing, barcode scanning.
- Buyers paying invoices online, self-registration, password reset, order editing after submission, or partial per-line approval — all recorded as non-goals in the buyer-portal design.

## This is the last planned phase

With the portal done, the system covers the whole spec except its explicit non-goals. Any further work (the deferred items, or the non-goals if the owner later wants them) starts a fresh spec → plan → implementation cycle.
