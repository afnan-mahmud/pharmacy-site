# ABC Pharmacy — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the pharmacy system — project scaffold, database, authentication, settings, medicine listing, and stock entry — such that the owner can log in, add medicines with box/pata rates, and stock them in.

**Architecture:** Next.js App Router with server actions talking to MongoDB Atlas through Mongoose. Pure business logic (money, unit conversion) lives in `src/lib/` as dependency-free functions tested in isolation. Models live in `src/models/`, one file each. Server actions live in `src/actions/`, grouped by domain. UI is Tailwind, server components by default.

**Tech Stack:** Next.js (App Router, TypeScript), MongoDB Atlas, Mongoose, Tailwind CSS, Vitest, mongodb-memory-server, bcryptjs, jose.

**Spec:** `docs/superpowers/specs/2026-07-16-pharmacy-management-design.md`

## Global Constraints

- **Money is stored as integer paisa, never floats.** 1 taka = 100 paisa. `12.50` taka is stored as `1250`. Floating-point money accumulates rounding errors that corrupt account balances. All prices in all models are paisa. Conversion happens only at the UI boundary via `src/lib/money.ts`.
- **Stock is stored as integer patas, never boxes.** Entry and display are in boxes; storage is patas. See spec, "Stock: entered in boxes, stored in patas, displayed as both".
- **Pharmacy name is never hardcoded.** It is read from the `Settings` document. The placeholder value is `"ABC Pharmacy"`. Any string literal `"ABC Pharmacy"` outside the seed script is a bug.
- **Currency symbol:** `৳` — the Taka sign.
- **Two roles only:** `admin`, `buyer`.
- **Timezone:** `Asia/Dhaka` for all date display and "today" calculations.
- **Tests must pass before a task is considered done.**
- **This project is not under version control, by the user's explicit choice.** Every step in this plan labelled "Commit" is to be **skipped** — do not run `git init`, `git add`, or `git commit`. Finish the task at the step before it. The commit steps are left in the document so they can be honoured if version control is added later.

---

### Task 1: Project scaffold and test infrastructure

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `.env.local`
- Create: `vitest.config.ts`, `tests/setup.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: nothing
- Produces: a running Next.js dev server, `npm test` running Vitest

- [ ] **Step 1: Scaffold the Next.js app**

Run from the project root (`/Users/afnanmahmud/Documents/pharmacy site`):

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*" --use-npm
```

When prompted about Turbopack, accept the default. The directory already contains `docs/` — accept the prompt to proceed in a non-empty directory.

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install mongoose bcryptjs jose
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths mongodb-memory-server @types/bcryptjs
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

Create `tests/setup.ts`:

```typescript
import { vi } from "vitest";

process.env.TZ = "Asia/Dhaka";
process.env.SESSION_SECRET ??= "test-secret-at-least-32-characters-long!!";

// Server actions call revalidatePath, which throws outside a Next.js request
// context. Mocked here rather than per-file because every action module imports
// it. Mocks declared in a setup file apply to all test files.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
```

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create the environment file template**

Create `.env.example`:

```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/abc-pharmacy?retryWrites=true&w=majority
SESSION_SECRET=change-me-to-a-random-32-plus-character-string
```

Create `.env.local` with the same keys and real values. `.env.local` is already in `.gitignore` from create-next-app — verify it is.

- [ ] **Step 6: Write a smoke test**

Create `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("runs tests in the Asia/Dhaka timezone", () => {
    expect(process.env.TZ).toBe("Asia/Dhaka");
  });
});
```

- [ ] **Step 7: Run the test to verify infrastructure works**

Run: `npm test`
Expected: PASS, 1 test passing.

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev`
Expected: server starts on http://localhost:3000 with no errors. Stop it with Ctrl-C.

---

### Task 2: Money utilities

Money is integer paisa everywhere. This module is the only place that converts.

**Files:**
- Create: `src/lib/money.ts`
- Test: `tests/lib/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `takaToPaisa(taka: string | number): number` — throws on invalid or negative input
  - `paisaToTaka(paisa: number): number`
  - `formatTaka(paisa: number): string` — e.g. `"৳1,250.50"`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/money.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { takaToPaisa, paisaToTaka, formatTaka } from "@/lib/money";

describe("takaToPaisa", () => {
  it("converts whole taka", () => {
    expect(takaToPaisa(12)).toBe(1200);
  });

  it("converts taka with paisa", () => {
    expect(takaToPaisa(12.5)).toBe(1250);
    expect(takaToPaisa("12.50")).toBe(1250);
    expect(takaToPaisa("0.05")).toBe(5);
  });

  it("does not lose precision on values that float math gets wrong", () => {
    expect(takaToPaisa(1.005)).toBe(101);
    expect(takaToPaisa("8.30")).toBe(830);
  });

  it("accepts zero", () => {
    expect(takaToPaisa(0)).toBe(0);
  });

  it("rejects negative amounts", () => {
    expect(() => takaToPaisa(-1)).toThrow("cannot be negative");
  });

  it("rejects non-numeric input", () => {
    expect(() => takaToPaisa("abc")).toThrow("not a valid amount");
    expect(() => takaToPaisa(NaN)).toThrow("not a valid amount");
  });
});

describe("paisaToTaka", () => {
  it("converts paisa back to taka", () => {
    expect(paisaToTaka(1250)).toBe(12.5);
    expect(paisaToTaka(0)).toBe(0);
  });
});

describe("formatTaka", () => {
  it("formats with the taka sign and two decimals", () => {
    expect(formatTaka(1250)).toBe("৳12.50");
  });

  it("groups thousands", () => {
    expect(formatTaka(125050)).toBe("৳1,250.50");
    expect(formatTaka(100000000)).toBe("৳1,000,000.00");
  });

  it("formats zero", () => {
    expect(formatTaka(0)).toBe("৳0.00");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: FAIL — cannot resolve `@/lib/money`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/money.ts`:

```typescript
/**
 * Money is stored as integer paisa throughout the system. 1 taka = 100 paisa.
 * This module is the only place taka and paisa convert.
 */

export function takaToPaisa(taka: string | number): number {
  const value = typeof taka === "string" ? Number(taka.trim()) : taka;

  if (typeof taka === "string" && taka.trim() === "") {
    throw new Error("Amount is not a valid amount");
  }
  if (!Number.isFinite(value)) {
    throw new Error("Amount is not a valid amount");
  }
  if (value < 0) {
    throw new Error("Amount cannot be negative");
  }

  // Round after scaling: 1.005 * 100 is 100.49999... in binary floating point,
  // so a bare Math.round on the product would give 100 instead of 101.
  return Math.round(Number((value * 100).toFixed(4)));
}

export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}

export function formatTaka(paisa: number): string {
  const formatted = (paisa / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `৳${formatted}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/money.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts tests/lib/money.test.ts
git commit -m "feat: add money utilities with integer paisa storage"
```

---

### Task 3: Box/pata unit conversion

The core of the stock model. Entry in boxes, storage in patas, display as both.

**Files:**
- Create: `src/lib/units.ts`
- Test: `tests/lib/units.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `boxesToPatas(boxes: number, patasPerBox: number): number`
  - `splitStock(stockPatas: number, patasPerBox: number): { boxes: number; patas: number }`
  - `formatStock(stockPatas: number, patasPerBox: number): string` — e.g. `"49 box 8 pata"`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/units.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { boxesToPatas, splitStock, formatStock } from "@/lib/units";

describe("boxesToPatas", () => {
  it("multiplies boxes by patas per box", () => {
    expect(boxesToPatas(50, 10)).toBe(500);
    expect(boxesToPatas(1, 12)).toBe(12);
    expect(boxesToPatas(0, 10)).toBe(0);
  });

  it("rejects a non-positive patasPerBox", () => {
    expect(() => boxesToPatas(5, 0)).toThrow("patasPerBox must be at least 1");
    expect(() => boxesToPatas(5, -1)).toThrow("patasPerBox must be at least 1");
  });

  it("rejects negative boxes", () => {
    expect(() => boxesToPatas(-1, 10)).toThrow("boxes cannot be negative");
  });

  it("rejects fractional input", () => {
    expect(() => boxesToPatas(1.5, 10)).toThrow("boxes must be a whole number");
    expect(() => boxesToPatas(5, 10.5)).toThrow("patasPerBox must be a whole number");
  });
});

describe("splitStock", () => {
  it("splits an exact number of boxes", () => {
    expect(splitStock(500, 10)).toEqual({ boxes: 50, patas: 0 });
  });

  it("splits boxes with a remainder", () => {
    expect(splitStock(498, 10)).toEqual({ boxes: 49, patas: 8 });
  });

  it("handles less than one box", () => {
    expect(splitStock(8, 10)).toEqual({ boxes: 0, patas: 8 });
  });

  it("handles empty stock", () => {
    expect(splitStock(0, 10)).toEqual({ boxes: 0, patas: 0 });
  });
});

describe("formatStock", () => {
  it("shows boxes and patas together", () => {
    expect(formatStock(498, 10)).toBe("49 box 8 pata");
  });

  it("omits patas when the split is exact", () => {
    expect(formatStock(500, 10)).toBe("50 box");
  });

  it("omits boxes when under one box", () => {
    expect(formatStock(8, 10)).toBe("8 pata");
  });

  it("shows empty stock as zero patas", () => {
    expect(formatStock(0, 10)).toBe("0 pata");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: FAIL — cannot resolve `@/lib/units`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/units.ts`:

```typescript
/**
 * Stock is stored as a single integer count of patas (strips). The owner enters
 * and reads stock in boxes, so every box quantity converts through here. Keeping
 * one canonical number means box and pata counts can never disagree.
 */

function assertWholeNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not a valid number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
}

function assertPatasPerBox(patasPerBox: number): void {
  if (!Number.isFinite(patasPerBox)) {
    throw new Error("patasPerBox is not a valid number");
  }
  if (!Number.isInteger(patasPerBox)) {
    throw new Error("patasPerBox must be a whole number");
  }
  if (patasPerBox < 1) {
    throw new Error("patasPerBox must be at least 1");
  }
}

export function boxesToPatas(boxes: number, patasPerBox: number): number {
  assertPatasPerBox(patasPerBox);
  assertWholeNonNegative(boxes, "boxes");
  return boxes * patasPerBox;
}

export function splitStock(
  stockPatas: number,
  patasPerBox: number,
): { boxes: number; patas: number } {
  assertPatasPerBox(patasPerBox);
  assertWholeNonNegative(stockPatas, "stockPatas");
  return {
    boxes: Math.floor(stockPatas / patasPerBox),
    patas: stockPatas % patasPerBox,
  };
}

export function formatStock(stockPatas: number, patasPerBox: number): string {
  const { boxes, patas } = splitStock(stockPatas, patasPerBox);
  if (boxes === 0) return `${patas} pata`;
  if (patas === 0) return `${boxes} box`;
  return `${boxes} box ${patas} pata`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/units.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts tests/lib/units.test.ts
git commit -m "feat: add box/pata conversion utilities"
```

---

### Task 4: Database connection

Next.js hot-reloads modules in development, which would open a new Mongoose connection on every reload and exhaust the Atlas connection limit. The connection is cached on `globalThis` to prevent that.

**Files:**
- Create: `src/lib/db.ts`
- Create: `tests/helpers/db.ts`

**Interfaces:**
- Consumes: `MONGODB_URI` env var
- Produces:
  - `connectDb(): Promise<typeof mongoose>`
  - Test helper: `setupTestDb()` — starts an in-memory replica set, wires Mongoose to it, and registers cleanup hooks

- [ ] **Step 1: Write the connection module**

Create `src/lib/db.ts`:

```typescript
import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Next.js hot reload re-evaluates modules; without this cache each reload would
// open a fresh connection and exhaust the Atlas connection pool.
const globalWithMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache = globalWithMongoose._mongooseCache ?? {
  conn: null,
  promise: null,
};
globalWithMongoose._mongooseCache = cache;

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
```

- [ ] **Step 2: Write the test database helper**

Transactions require a replica set, so the in-memory server runs in replica-set mode. Order approval in a later plan depends on this.

Create `tests/helpers/db.ts`:

```typescript
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

/**
 * Starts an in-memory MongoDB replica set for the current test file and points
 * Mongoose at it. Replica-set mode (not the simpler standalone) is required
 * because the system uses multi-document transactions.
 */
export function setupTestDb(): void {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
}
```

- [ ] **Step 3: Write a test proving the replica set supports transactions**

Create `tests/helpers/db.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "./db";

setupTestDb();

describe("test database", () => {
  it("connects", () => {
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("supports transactions, which order approval depends on", async () => {
    const Thing = mongoose.model(
      "TxProbe",
      new mongoose.Schema({ n: Number }),
    );
    await Thing.createCollection();

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Thing.create([{ n: 1 }], { session });
    });
    await session.endSession();

    expect(await Thing.countDocuments()).toBe(1);
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/helpers/db.test.ts`
Expected: PASS. The first run downloads a MongoDB binary and may take a minute.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts tests/helpers/db.ts tests/helpers/db.test.ts
git commit -m "feat: add cached mongoose connection and test db helper"
```

---

### Task 5: Settings model and seed

The single source of truth for pharmacy identity. Nothing hardcodes the name.

**Files:**
- Create: `src/models/Settings.ts`
- Create: `src/actions/settings.ts`
- Test: `tests/actions/settings.test.ts`

**Interfaces:**
- Consumes: `connectDb` from Task 4
- Produces:
  - `SettingsModel` — Mongoose model
  - `getSettings(): Promise<SettingsDoc>` — returns the singleton, creating it with defaults if absent
  - `updateSettings(input: SettingsInput): Promise<SettingsDoc>`
  - `SettingsInput = { pharmacyName: string; address: string; phone: string; invoicePrefix: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/settings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import { getSettings, updateSettings } from "@/actions/settings";
import { SettingsModel } from "@/models/Settings";

setupTestDb();

describe("getSettings", () => {
  it("creates the singleton with the placeholder name on first read", async () => {
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("ABC Pharmacy");
    expect(settings.invoicePrefix).toBe("ABC");
  });

  it("never creates a second settings document", async () => {
    await getSettings();
    await getSettings();
    expect(await SettingsModel.countDocuments()).toBe(1);
  });

  it("returns the stored settings once they exist", async () => {
    await updateSettings({
      pharmacyName: "Real Pharmacy",
      address: "123 Road, Dhaka",
      phone: "01700000000",
      invoicePrefix: "RP",
    });
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("Real Pharmacy");
  });
});

describe("updateSettings", () => {
  it("updates the name without creating a duplicate", async () => {
    await getSettings();
    await updateSettings({
      pharmacyName: "New Name",
      address: "Somewhere",
      phone: "01800000000",
      invoicePrefix: "NN",
    });
    expect(await SettingsModel.countDocuments()).toBe(1);
    const settings = await getSettings();
    expect(settings.pharmacyName).toBe("New Name");
  });

  it("rejects an empty pharmacy name", async () => {
    await expect(
      updateSettings({
        pharmacyName: "  ",
        address: "x",
        phone: "y",
        invoicePrefix: "Z",
      }),
    ).rejects.toThrow("Pharmacy name is required");
  });

  it("rejects an empty invoice prefix", async () => {
    await expect(
      updateSettings({
        pharmacyName: "Name",
        address: "x",
        phone: "y",
        invoicePrefix: "",
      }),
    ).rejects.toThrow("Invoice prefix is required");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/settings.test.ts`
Expected: FAIL — cannot resolve `@/actions/settings`.

- [ ] **Step 3: Write the model**

Create `src/models/Settings.ts`:

```typescript
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const settingsSchema = new Schema(
  {
    // Fixed key guarantees exactly one settings document.
    key: { type: String, required: true, unique: true, default: "singleton" },
    pharmacyName: { type: String, required: true, default: "ABC Pharmacy" },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    invoicePrefix: { type: String, required: true, default: "ABC" },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;

export const SettingsModel: Model<SettingsDoc> =
  (mongoose.models.Settings as Model<SettingsDoc>) ??
  mongoose.model<SettingsDoc>("Settings", settingsSchema);
```

- [ ] **Step 4: Write the actions**

Create `src/actions/settings.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { SettingsModel, type SettingsDoc } from "@/models/Settings";

export type SettingsInput = {
  pharmacyName: string;
  address: string;
  phone: string;
  invoicePrefix: string;
};

export async function getSettings(): Promise<SettingsDoc> {
  await connectDb();
  const settings = await SettingsModel.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<SettingsDoc>();
  return settings!;
}

export async function updateSettings(input: SettingsInput): Promise<SettingsDoc> {
  await connectDb();

  const pharmacyName = input.pharmacyName.trim();
  const invoicePrefix = input.invoicePrefix.trim();

  if (!pharmacyName) throw new Error("Pharmacy name is required");
  if (!invoicePrefix) throw new Error("Invoice prefix is required");

  const settings = await SettingsModel.findOneAndUpdate(
    { key: "singleton" },
    {
      $set: {
        pharmacyName,
        invoicePrefix,
        address: input.address.trim(),
        phone: input.phone.trim(),
      },
      $setOnInsert: { key: "singleton" },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<SettingsDoc>();

  revalidatePath("/", "layout");
  return settings!;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/settings.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/models/Settings.ts src/actions/settings.ts tests/actions/settings.test.ts
git commit -m "feat: add settings singleton with configurable pharmacy name"
```

---

### Task 6: Password hashing and session tokens

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Consumes: `SESSION_SECRET` env var
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `createSessionToken(payload: SessionPayload): Promise<string>`
  - `readSessionToken(token: string): Promise<SessionPayload | null>`
  - `SessionPayload = { userId: string; role: "admin" | "buyer"; name: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  readSessionToken,
} from "@/lib/auth";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-horse", hash)).toBe(false);
  });

  it("never stores the plaintext", async () => {
    const hash = await hashPassword("correct-horse");
    expect(hash).not.toContain("correct-horse");
  });

  it("produces a different hash each time for the same password", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("rejects a password shorter than 6 characters", async () => {
    await expect(hashPassword("12345")).rejects.toThrow(
      "Password must be at least 6 characters",
    );
  });
});

describe("session tokens", () => {
  it("round-trips a payload", async () => {
    const token = await createSessionToken({
      userId: "abc123",
      role: "admin",
      name: "Owner",
    });
    const payload = await readSessionToken(token);
    expect(payload).toMatchObject({
      userId: "abc123",
      role: "admin",
      name: "Owner",
    });
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken({
      userId: "abc123",
      role: "buyer",
      name: "Buyer",
    });
    expect(await readSessionToken(token.slice(0, -3) + "xyz")).toBeNull();
  });

  it("returns null for a garbage token", async () => {
    expect(await readSessionToken("not-a-token")).toBeNull();
  });

  it("returns null for an empty token", async () => {
    expect(await readSessionToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth.ts`:

```typescript
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export type Role = "admin" | "buyer";

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
};

const SESSION_DURATION = "7d";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(secretKey());
}

export async function readSessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const { userId, role, name } = payload as Record<string, unknown>;
    if (typeof userId !== "string") return null;
    if (role !== "admin" && role !== "buyer") return null;
    if (typeof name !== "string") return null;
    return { userId, role, name };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/auth.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/lib/auth.test.ts
git commit -m "feat: add password hashing and session tokens"
```

---

### Task 7: Admin user model, login, and route protection

**Files:**
- Create: `src/models/AdminUser.ts`
- Create: `src/lib/session.ts`
- Create: `src/actions/auth.ts`
- Create: `src/app/login/page.tsx`
- Create: `scripts/seed.ts`
- Test: `tests/actions/auth.test.ts`

Route protection lives in the admin layout via `requireAdmin()`, not in middleware. Middleware runs on the Edge runtime, which cannot open a Mongoose connection — so any check that needs the database would have to be duplicated in the layout anyway.

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword`, `createSessionToken`, `readSessionToken` (Task 6); `connectDb` (Task 4)
- Produces:
  - `AdminUserModel`
  - `login(username: string, password: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `logout(): Promise<void>`
  - `getSession(): Promise<SessionPayload | null>` — reads the cookie
  - `requireAdmin(): Promise<SessionPayload>` — redirects to `/login` if not an admin

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { AdminUserModel } from "@/models/AdminUser";
import { hashPassword } from "@/lib/auth";

const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

beforeEach(async () => {
  vi.clearAllMocks();
  await AdminUserModel.create({
    username: "owner",
    passwordHash: await hashPassword("secret123"),
    name: "Owner",
  });
});

describe("login", () => {
  it("succeeds with correct credentials and sets a session cookie", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login("owner", "secret123");
    expect(result.ok).toBe(true);
    expect(cookieStore.set).toHaveBeenCalledOnce();

    const [name, , options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("session");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });

  it("fails with a wrong password and sets no cookie", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login("owner", "wrong");
    expect(result).toEqual({ ok: false, error: "Username ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("fails for an unknown username", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login("nobody", "secret123");
    expect(result).toEqual({ ok: false, error: "Username ba password bhul" });
  });

  it("gives the same error for a wrong username as a wrong password", async () => {
    const { login } = await import("@/actions/auth");
    const unknownUser = await login("nobody", "secret123");
    const wrongPassword = await login("owner", "wrong");
    // Distinguishable errors would let an attacker enumerate valid usernames.
    expect(unknownUser).toEqual(wrongPassword);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/auth.test.ts`
Expected: FAIL — cannot resolve `@/models/AdminUser`.

- [ ] **Step 3: Write the admin user model**

Create `src/models/AdminUser.ts`:

```typescript
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const adminUserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export type AdminUserDoc = InferSchemaType<typeof adminUserSchema>;

export const AdminUserModel: Model<AdminUserDoc> =
  (mongoose.models.AdminUser as Model<AdminUserDoc>) ??
  mongoose.model<AdminUserDoc>("AdminUser", adminUserSchema);
```

- [ ] **Step 4: Write the session helpers**

Create `src/lib/session.ts`:

```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, type SessionPayload } from "@/lib/auth";

export const SESSION_COOKIE = "session";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  return session;
}
```

- [ ] **Step 5: Write the auth actions**

Create `src/actions/auth.ts`:

```typescript
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { AdminUserModel } from "@/models/AdminUser";
import { verifyPassword, createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export type LoginResult = { ok: true } | { ok: false; error: string };

// One message for both failure modes: separate messages would let an attacker
// discover which usernames exist.
const LOGIN_FAILED = "Username ba password bhul";

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  await connectDb();

  const user = await AdminUserModel.findOne({ username: username.trim() });
  if (!user) return { ok: false, error: LOGIN_FAILED };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: LOGIN_FAILED };

  const token = await createSessionToken({
    userId: String(user._id),
    role: "admin",
    name: user.name,
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

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/auth.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Write the login page**

Create `src/app/login/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await login(username, password);
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(result.error);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">Login</h1>

        <div className="space-y-1">
          <label htmlFor="username" className="text-sm text-slate-700">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Wait..." : "Login"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Write the seed script**

Create `scripts/seed.ts`:

```typescript
/**
 * Creates the initial admin account and settings document.
 * Run once against a fresh database: npx tsx scripts/seed.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { AdminUserModel } from "../src/models/AdminUser";
import { SettingsModel } from "../src/models/Settings";
import { hashPassword } from "../src/lib/auth";

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);

  const existing = await AdminUserModel.findOne({ username: "owner" });
  if (existing) {
    console.log("Admin user already exists, skipping.");
  } else {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
      throw new Error(
        "SEED_ADMIN_PASSWORD is not set. Choose a password and set it before seeding.",
      );
    }
    await AdminUserModel.create({
      username: "owner",
      passwordHash: await hashPassword(password),
      name: "Owner",
    });
    console.log("Created admin user 'owner'.");
  }

  await SettingsModel.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { key: "singleton" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log("Settings ready.");

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Install the script's dependencies:

```bash
npm install -D tsx dotenv
```

Add to `.env.example` and `.env.local`:

```
SEED_ADMIN_PASSWORD=pick-a-strong-password
```

Add to `package.json` scripts:

```json
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 9: Run the seed and verify login works end to end**

```bash
npm run seed
npm run dev
```

Open http://localhost:3000/login, log in with `owner` and the seed password.
Expected: redirect to `/dashboard` (which 404s until Task 8 — that is correct at this point). A wrong password shows "Username ba password bhul".

- [ ] **Step 10: Commit**

```bash
git add src/models/AdminUser.ts src/lib/session.ts src/actions/auth.ts src/app/login/page.tsx scripts/seed.ts tests/actions/auth.test.ts package.json .env.example
git commit -m "feat: add admin login with session cookies and seed script"
```

---

### Task 8: Admin shell and dashboard placeholder

**Files:**
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(admin)/dashboard/page.tsx`
- Create: `src/components/AdminNav.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 7), `getSettings` (Task 5)
- Produces: an authenticated admin layout wrapping every `(admin)` route; the pharmacy name renders from Settings

- [ ] **Step 1: Write the nav component**

Create `src/components/AdminNav.tsx`:

```typescript
import Link from "next/link";
import { logout } from "@/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/medicines", label: "Medicine" },
  { href: "/stock", label: "Stock In" },
  { href: "/settings", label: "Settings" },
];

export function AdminNav({ pharmacyName }: { pharmacyName: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-semibold text-teal-800">{pharmacyName}</span>
        <nav className="flex gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-slate-600 hover:text-teal-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="ml-auto">
          <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Write the admin layout**

Create `src/app/(admin)/layout.tsx`:

```typescript
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/actions/settings";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav pharmacyName={settings.pharmacyName} />
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write the dashboard placeholder**

The real dashboard is built in the Sale plan, once there are sales to summarize.

Create `src/app/(admin)/dashboard/page.tsx`:

```typescript
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-500">
        Bikri ar baki-r hisab ekhane ashbe.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Redirect the root to the dashboard**

Replace `src/app/page.tsx` entirely:

```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 5: Verify protection works**

```bash
npm run dev
```

- Visit http://localhost:3000/dashboard in a private window (no session cookie).
  Expected: redirected to `/login`.
- Log in, then visit `/dashboard`.
  Expected: the dashboard renders with "ABC Pharmacy" in the nav.
- In MongoDB Atlas, change `pharmacyName` on the settings document to "Test Name" and reload.
  Expected: the nav shows "Test Name". Change it back.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)" src/components/AdminNav.tsx src/app/page.tsx
git commit -m "feat: add protected admin shell reading pharmacy name from settings"
```

---

### Task 9: Medicine model and actions

**Files:**
- Create: `src/models/Medicine.ts`
- Create: `src/actions/medicines.ts`
- Test: `tests/actions/medicines.test.ts`

**Interfaces:**
- Consumes: `connectDb` (Task 4), `boxesToPatas` (Task 3)
- Produces:
  - `MedicineModel`
  - `MedicineInput = { name: string; genericName: string; company: string; patasPerBox: number; boxPricePaisa: number; pataPricePaisa: number; lowStockThreshold: number }`
  - `createMedicine(input: MedicineInput): Promise<MedicineDoc>`
  - `updateMedicine(id: string, input: MedicineInput): Promise<MedicineDoc>`
  - `listMedicines(query?: string): Promise<MedicineDoc[]>`
  - `searchMedicines(query: string, limit?: number): Promise<MedicineDoc[]>` — used by the type-ahead in the Sale plan
  - `deactivateMedicine(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/medicines.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMedicine,
  updateMedicine,
  listMedicines,
  searchMedicines,
  deactivateMedicine,
} from "@/actions/medicines";

setupTestDb();

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  boxPricePaisa: 12000,
  pataPricePaisa: 1400,
  lowStockThreshold: 20,
};

describe("createMedicine", () => {
  it("creates a medicine with zero stock", async () => {
    const medicine = await createMedicine(napa);
    expect(medicine.name).toBe("Napa 500mg");
    expect(medicine.stockPatas).toBe(0);
    expect(medicine.active).toBe(true);
  });

  it("stores both the box rate and the pata rate", async () => {
    const medicine = await createMedicine(napa);
    expect(medicine.boxPricePaisa).toBe(12000);
    expect(medicine.pataPricePaisa).toBe(1400);
  });

  it("rejects an empty name", async () => {
    await expect(createMedicine({ ...napa, name: "  " })).rejects.toThrow(
      "Medicine name is required",
    );
  });

  it("rejects a duplicate name", async () => {
    await createMedicine(napa);
    await expect(createMedicine(napa)).rejects.toThrow("already exists");
  });

  it("treats duplicate names case-insensitively", async () => {
    await createMedicine(napa);
    await expect(
      createMedicine({ ...napa, name: "NAPA 500MG" }),
    ).rejects.toThrow("already exists");
  });

  it("rejects patasPerBox below 1", async () => {
    await expect(createMedicine({ ...napa, patasPerBox: 0 })).rejects.toThrow(
      "patasPerBox must be at least 1",
    );
  });

  it("rejects negative prices", async () => {
    await expect(
      createMedicine({ ...napa, boxPricePaisa: -1 }),
    ).rejects.toThrow("cannot be negative");
  });
});

describe("listMedicines", () => {
  it("returns active medicines sorted by name", async () => {
    await createMedicine({ ...napa, name: "Zimax" });
    await createMedicine({ ...napa, name: "Ace" });
    const list = await listMedicines();
    expect(list.map((m) => m.name)).toEqual(["Ace", "Zimax"]);
  });

  it("excludes deactivated medicines", async () => {
    const medicine = await createMedicine(napa);
    await deactivateMedicine(String(medicine._id));
    expect(await listMedicines()).toHaveLength(0);
  });

  it("filters by a name query", async () => {
    await createMedicine({ ...napa, name: "Napa Extra" });
    await createMedicine({ ...napa, name: "Zimax" });
    const list = await listMedicines("napa");
    expect(list.map((m) => m.name)).toEqual(["Napa Extra"]);
  });
});

describe("searchMedicines", () => {
  it("matches on a partial name, case-insensitively", async () => {
    await createMedicine(napa);
    const results = await searchMedicines("nap");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Napa 500mg");
  });

  it("matches on the generic name", async () => {
    await createMedicine(napa);
    const results = await searchMedicines("paracet");
    expect(results).toHaveLength(1);
  });

  it("returns nothing for an empty query", async () => {
    await createMedicine(napa);
    expect(await searchMedicines("")).toEqual([]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 15; i++) {
      await createMedicine({ ...napa, name: `Napa ${i}` });
    }
    expect(await searchMedicines("napa", 10)).toHaveLength(10);
  });

  it("does not leak a regex from the query into the match", async () => {
    await createMedicine(napa);
    // A user typing ".*" must not match everything.
    expect(await searchMedicines(".*")).toEqual([]);
  });
});

describe("updateMedicine", () => {
  it("updates prices", async () => {
    const medicine = await createMedicine(napa);
    const updated = await updateMedicine(String(medicine._id), {
      ...napa,
      boxPricePaisa: 13000,
    });
    expect(updated.boxPricePaisa).toBe(13000);
  });

  it("does not touch stock", async () => {
    const medicine = await createMedicine(napa);
    const updated = await updateMedicine(String(medicine._id), {
      ...napa,
      name: "Napa 665mg",
    });
    expect(updated.stockPatas).toBe(0);
  });

  it("throws for an unknown id", async () => {
    await expect(
      updateMedicine("507f1f77bcf86cd799439011", napa),
    ).rejects.toThrow("Medicine not found");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/medicines.test.ts`
Expected: FAIL — cannot resolve `@/actions/medicines`.

- [ ] **Step 3: Write the model**

Create `src/models/Medicine.ts`:

```typescript
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased copy of `name`, used only to enforce case-insensitive
    // uniqueness. Kept in sync by the actions, never edited directly.
    nameLower: { type: String, required: true, unique: true },
    genericName: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    patasPerBox: { type: Number, required: true, min: 1 },
    boxPricePaisa: { type: Number, required: true, min: 0 },
    pataPricePaisa: { type: Number, required: true, min: 0 },
    // Canonical stock. Always patas, never boxes. See src/lib/units.ts.
    stockPatas: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

medicineSchema.index({ name: 1 });
medicineSchema.index({ genericName: 1 });

export type MedicineDoc = InferSchemaType<typeof medicineSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MedicineModel: Model<MedicineDoc> =
  (mongoose.models.Medicine as Model<MedicineDoc>) ??
  mongoose.model<MedicineDoc>("Medicine", medicineSchema);
```

- [ ] **Step 4: Write the actions**

Create `src/actions/medicines.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";

export type MedicineInput = {
  name: string;
  genericName: string;
  company: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  lowStockThreshold: number;
};

/** Escapes regex metacharacters so a typed "." or "*" is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validate(input: MedicineInput): void {
  if (!input.name.trim()) throw new Error("Medicine name is required");
  if (!Number.isInteger(input.patasPerBox) || input.patasPerBox < 1) {
    throw new Error("patasPerBox must be at least 1");
  }
  if (input.boxPricePaisa < 0 || input.pataPricePaisa < 0) {
    throw new Error("Price cannot be negative");
  }
  if (input.lowStockThreshold < 0) {
    throw new Error("Low stock threshold cannot be negative");
  }
}

function toFields(input: MedicineInput) {
  return {
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    genericName: input.genericName.trim(),
    company: input.company.trim(),
    patasPerBox: input.patasPerBox,
    boxPricePaisa: input.boxPricePaisa,
    pataPricePaisa: input.pataPricePaisa,
    lowStockThreshold: input.lowStockThreshold,
  };
}

export async function createMedicine(
  input: MedicineInput,
): Promise<MedicineDoc> {
  await connectDb();
  validate(input);

  try {
    const medicine = await MedicineModel.create(toFields(input));
    revalidatePath("/medicines");
    return medicine.toObject();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error(`Medicine "${input.name.trim()}" already exists`);
    }
    throw error;
  }
}

export async function updateMedicine(
  id: string,
  input: MedicineInput,
): Promise<MedicineDoc> {
  await connectDb();
  validate(input);

  try {
    // stockPatas is deliberately absent from the update: stock only ever
    // changes through stock-in and sales, never through the medicine form.
    const medicine = await MedicineModel.findByIdAndUpdate(
      id,
      { $set: toFields(input) },
      { new: true, runValidators: true },
    ).lean<MedicineDoc>();

    if (!medicine) throw new Error("Medicine not found");
    revalidatePath("/medicines");
    return medicine;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error(`Medicine "${input.name.trim()}" already exists`);
    }
    throw error;
  }
}

export async function listMedicines(query?: string): Promise<MedicineDoc[]> {
  await connectDb();

  const filter: Record<string, unknown> = { active: true };
  if (query?.trim()) {
    filter.name = { $regex: escapeRegex(query.trim()), $options: "i" };
  }

  return MedicineModel.find(filter).sort({ name: 1 }).lean<MedicineDoc[]>();
}

export async function searchMedicines(
  query: string,
  limit = 10,
): Promise<MedicineDoc[]> {
  await connectDb();
  const term = query.trim();
  if (!term) return [];

  const pattern = { $regex: escapeRegex(term), $options: "i" };
  return MedicineModel.find({
    active: true,
    $or: [{ name: pattern }, { genericName: pattern }],
  })
    .sort({ name: 1 })
    .limit(limit)
    .lean<MedicineDoc[]>();
}

export async function deactivateMedicine(id: string): Promise<void> {
  await connectDb();
  // Deactivated, not deleted: past sales reference this medicine.
  await MedicineModel.findByIdAndUpdate(id, { $set: { active: false } });
  revalidatePath("/medicines");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/medicines.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/models/Medicine.ts src/actions/medicines.ts tests/actions/medicines.test.ts
git commit -m "feat: add medicine model with box and pata rates"
```

---

### Task 10: Medicine admin UI

**Files:**
- Create: `src/app/(admin)/medicines/page.tsx`
- Create: `src/components/MedicineForm.tsx`
- Create: `src/components/MedicineTable.tsx`

**Interfaces:**
- Consumes: `listMedicines`, `createMedicine`, `updateMedicine`, `deactivateMedicine` (Task 9); `formatTaka`, `takaToPaisa` (Task 2); `formatStock` (Task 3)
- Produces: a working medicine listing screen

- [ ] **Step 1: Write the form component**

The form takes taka from the user and converts to paisa at this boundary — the only place that conversion happens on input.

Create `src/components/MedicineForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMedicine, updateMedicine } from "@/actions/medicines";
import { takaToPaisa, paisaToTaka } from "@/lib/money";

export type MedicineFormValues = {
  id?: string;
  name: string;
  genericName: string;
  company: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  lowStockThreshold: number;
};

export function MedicineForm({
  initial,
  onDone,
}: {
  initial?: MedicineFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [genericName, setGenericName] = useState(initial?.genericName ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [patasPerBox, setPatasPerBox] = useState(
    String(initial?.patasPerBox ?? 10),
  );
  const [boxPrice, setBoxPrice] = useState(
    initial ? String(paisaToTaka(initial.boxPricePaisa)) : "",
  );
  const [pataPrice, setPataPrice] = useState(
    initial ? String(paisaToTaka(initial.pataPricePaisa)) : "",
  );
  const [threshold, setThreshold] = useState(
    String(initial?.lowStockThreshold ?? 0),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const input = {
        name,
        genericName,
        company,
        patasPerBox: Number(patasPerBox),
        boxPricePaisa: takaToPaisa(boxPrice || 0),
        pataPricePaisa: takaToPaisa(pataPrice || 0),
        lowStockThreshold: Number(threshold),
      };

      if (initial?.id) {
        await updateMedicine(initial.id, input);
      } else {
        await createMedicine(input);
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const label = "text-sm text-slate-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">
        {initial?.id ? "Medicine edit" : "Notun medicine"}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="name" className={label}>Nam</label>
          <input id="name" className={field} value={name}
            onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="generic" className={label}>Generic nam</label>
          <input id="generic" className={field} value={genericName}
            onChange={(e) => setGenericName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="company" className={label}>Company</label>
          <input id="company" className={field} value={company}
            onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="ppb" className={label}>1 box e koto pata</label>
          <input id="ppb" type="number" min={1} className={field} value={patasPerBox}
            onChange={(e) => setPatasPerBox(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="boxPrice" className={label}>Box rate (৳) — wholesale</label>
          <input id="boxPrice" type="number" step="0.01" min={0} className={field}
            value={boxPrice} onChange={(e) => setBoxPrice(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="pataPrice" className={label}>Pata rate (৳) — khuchra</label>
          <input id="pataPrice" type="number" step="0.01" min={0} className={field}
            value={pataPrice} onChange={(e) => setPataPrice(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label htmlFor="threshold" className={label}>Stock kom alert (pata)</label>
          <input id="threshold" type="number" min={0} className={field} value={threshold}
            onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Wait..." : "Save"}
        </button>
        <button type="button" onClick={onDone}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the table component**

Create `src/components/MedicineTable.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateMedicine } from "@/actions/medicines";
import { formatTaka } from "@/lib/money";
import { formatStock } from "@/lib/units";
import { MedicineForm, type MedicineFormValues } from "./MedicineForm";

export type MedicineRow = MedicineFormValues & {
  id: string;
  stockPatas: number;
};

export function MedicineTable({ medicines }: { medicines: MedicineRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MedicineRow | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleDeactivate(row: MedicineRow) {
    await deactivateMedicine(row.id);
    router.refresh();
  }

  if (adding || editing) {
    return (
      <MedicineForm
        initial={editing ?? undefined}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Medicine</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
        >
          + Notun medicine
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="p-3">Nam</th>
              <th className="p-3">Company</th>
              <th className="p-3">1 box</th>
              <th className="p-3">Box rate</th>
              <th className="p-3">Pata rate</th>
              <th className="p-3">Stock</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {medicines.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Kono medicine nai. Upor theke add koro.
                </td>
              </tr>
            )}
            {medicines.map((row) => {
              const low = row.stockPatas <= row.lowStockThreshold;
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="p-3">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.genericName}</div>
                  </td>
                  <td className="p-3 text-slate-600">{row.company}</td>
                  <td className="p-3 text-slate-600">{row.patasPerBox} pata</td>
                  <td className="p-3">{formatTaka(row.boxPricePaisa)}</td>
                  <td className="p-3">{formatTaka(row.pataPricePaisa)}</td>
                  <td className={`p-3 ${low ? "font-medium text-red-600" : "text-slate-700"}`}>
                    {formatStock(row.stockPatas, row.patasPerBox)}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(row)}
                      className="text-teal-700 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDeactivate(row)}
                      className="ml-3 text-slate-400 hover:text-red-600">
                      Off
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(admin)/medicines/page.tsx`:

```typescript
import { listMedicines } from "@/actions/medicines";
import { MedicineTable, type MedicineRow } from "@/components/MedicineTable";

export default async function MedicinesPage() {
  const medicines = await listMedicines();

  const rows: MedicineRow[] = medicines.map((m) => ({
    id: String(m._id),
    name: m.name,
    genericName: m.genericName,
    company: m.company,
    patasPerBox: m.patasPerBox,
    boxPricePaisa: m.boxPricePaisa,
    pataPricePaisa: m.pataPricePaisa,
    lowStockThreshold: m.lowStockThreshold,
    stockPatas: m.stockPatas,
  }));

  return <MedicineTable medicines={rows} />;
}
```

- [ ] **Step 4: Verify the screen works**

```bash
npm run dev
```

Log in, go to http://localhost:3000/medicines and confirm:
- Adding "Napa 500mg", generic "Paracetamol", 10 patas/box, box rate 120, pata rate 14 → appears in the table showing `৳120.00`, `৳14.00`, stock `0 pata`
- Adding a second medicine named "napa 500mg" → error "already exists"
- Editing a medicine's box rate → the table shows the new rate
- "Off" removes the row from the list

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/medicines" src/components/MedicineForm.tsx src/components/MedicineTable.tsx
git commit -m "feat: add medicine listing screen"
```

---

### Task 11: Stock entry

**Files:**
- Create: `src/models/StockEntry.ts`
- Create: `src/actions/stock.ts`
- Test: `tests/actions/stock.test.ts`

**Interfaces:**
- Consumes: `connectDb` (Task 4), `boxesToPatas` (Task 3), `MedicineModel` (Task 9)
- Produces:
  - `StockEntryModel`
  - `stockIn(input: { medicineId: string; boxes: number; note: string; userId: string }): Promise<void>`
  - `listStockEntries(limit?: number): Promise<StockEntryDoc[]>`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/stock.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/db";
import { createMedicine } from "@/actions/medicines";
import { stockIn, listStockEntries } from "@/actions/stock";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel } from "@/models/StockEntry";

setupTestDb();

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  boxPricePaisa: 12000,
  pataPricePaisa: 1400,
  lowStockThreshold: 20,
};

const USER_ID = "507f1f77bcf86cd799439011";

describe("stockIn", () => {
  it("converts boxes to patas and increases stock", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "",
      userId: USER_ID,
    });

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(500);
  });

  it("accumulates across entries", async () => {
    const medicine = await createMedicine(napa);
    const entry = { medicineId: String(medicine._id), note: "", userId: USER_ID };
    await stockIn({ ...entry, boxes: 50 });
    await stockIn({ ...entry, boxes: 20 });

    const updated = await MedicineModel.findById(medicine._id);
    expect(updated!.stockPatas).toBe(700);
  });

  it("records the entry with the snapshotted pata count", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 50,
      note: "Beximco delivery",
      userId: USER_ID,
    });

    const entries = await StockEntryModel.find();
    expect(entries).toHaveLength(1);
    expect(entries[0].boxes).toBe(50);
    expect(entries[0].patasAdded).toBe(500);
    expect(entries[0].note).toBe("Beximco delivery");
  });

  it("keeps the historical patasAdded when patasPerBox later changes", async () => {
    const medicine = await createMedicine(napa);
    await stockIn({
      medicineId: String(medicine._id),
      boxes: 10,
      note: "",
      userId: USER_ID,
    });

    // The pack size changes; history must not be retroactively rewritten.
    await MedicineModel.findByIdAndUpdate(medicine._id, {
      $set: { patasPerBox: 12 },
    });

    const entry = await StockEntryModel.findOne();
    expect(entry!.patasAdded).toBe(100);
  });

  it("rejects zero boxes", async () => {
    const medicine = await createMedicine(napa);
    await expect(
      stockIn({ medicineId: String(medicine._id), boxes: 0, note: "", userId: USER_ID }),
    ).rejects.toThrow("Box সংখ্যা 1 er kom hote parbe na");
  });

  it("rejects negative boxes", async () => {
    const medicine = await createMedicine(napa);
    await expect(
      stockIn({ medicineId: String(medicine._id), boxes: -5, note: "", userId: USER_ID }),
    ).rejects.toThrow("Box সংখ্যা 1 er kom hote parbe na");
  });

  it("rejects an unknown medicine and writes no entry", async () => {
    await expect(
      stockIn({
        medicineId: "507f1f77bcf86cd799439011",
        boxes: 5,
        note: "",
        userId: USER_ID,
      }),
    ).rejects.toThrow("Medicine not found");
    expect(await StockEntryModel.countDocuments()).toBe(0);
  });
});

describe("listStockEntries", () => {
  it("returns entries newest first", async () => {
    const medicine = await createMedicine(napa);
    const base = { medicineId: String(medicine._id), note: "", userId: USER_ID };
    await stockIn({ ...base, boxes: 1 });
    await stockIn({ ...base, boxes: 2 });

    const entries = await listStockEntries();
    expect(entries[0].boxes).toBe(2);
    expect(entries[1].boxes).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/stock.test.ts`
Expected: FAIL — cannot resolve `@/actions/stock`.

- [ ] **Step 3: Write the model**

Create `src/models/StockEntry.ts`:

```typescript
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const stockEntrySchema = new Schema(
  {
    medicineId: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
      index: true,
    },
    medicineName: { type: String, required: true },
    boxes: { type: Number, required: true, min: 1 },
    // Snapshotted at entry time. If patasPerBox later changes on the medicine,
    // this record still says how many patas actually entered stock that day.
    patasAdded: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
  },
  { timestamps: true },
);

export type StockEntryDoc = InferSchemaType<typeof stockEntrySchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const StockEntryModel: Model<StockEntryDoc> =
  (mongoose.models.StockEntry as Model<StockEntryDoc>) ??
  mongoose.model<StockEntryDoc>("StockEntry", stockEntrySchema);
```

- [ ] **Step 4: Write the actions**

Create `src/actions/stock.ts`:

```typescript
"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { boxesToPatas } from "@/lib/units";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel, type StockEntryDoc } from "@/models/StockEntry";

export type StockInInput = {
  medicineId: string;
  boxes: number;
  note: string;
  userId: string;
};

export async function stockIn(input: StockInInput): Promise<void> {
  await connectDb();

  if (!Number.isInteger(input.boxes) || input.boxes < 1) {
    throw new Error("Box সংখ্যা 1 er kom hote parbe na");
  }

  const medicine = await MedicineModel.findById(input.medicineId);
  if (!medicine) throw new Error("Medicine not found");

  const patasAdded = boxesToPatas(input.boxes, medicine.patasPerBox);

  // The stock increment and the audit record must both land or neither:
  // an increment without a record is stock nobody can account for.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await MedicineModel.updateOne(
        { _id: medicine._id },
        { $inc: { stockPatas: patasAdded } },
        { session },
      );
      await StockEntryModel.create(
        [
          {
            medicineId: medicine._id,
            medicineName: medicine.name,
            boxes: input.boxes,
            patasAdded,
            note: input.note.trim(),
            createdBy: new mongoose.Types.ObjectId(input.userId),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/stock");
  revalidatePath("/medicines");
}

export async function listStockEntries(limit = 50): Promise<StockEntryDoc[]> {
  await connectDb();
  return StockEntryModel.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<StockEntryDoc[]>();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/stock.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/models/StockEntry.ts src/actions/stock.ts tests/actions/stock.test.ts
git commit -m "feat: add transactional stock entry"
```

---

### Task 12: Stock-in UI

**Files:**
- Create: `src/app/(admin)/stock/page.tsx`
- Create: `src/components/StockInForm.tsx`
- Create: `src/components/MedicinePicker.tsx`

**Interfaces:**
- Consumes: `searchMedicines` (Task 9), `stockIn`, `listStockEntries` (Task 11), `formatStock` (Task 3), `getSession` (Task 7)
- Produces: `MedicinePicker` — a reusable type-ahead the Sale plan reuses for both sale screens

- [ ] **Step 1: Write the medicine picker**

This is deliberately generic: the retail and wholesale sale screens in the next plan need exactly this control.

Create `src/components/MedicinePicker.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { searchMedicines } from "@/actions/medicines";
import { formatStock } from "@/lib/units";

export type PickedMedicine = {
  id: string;
  name: string;
  genericName: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  stockPatas: number;
};

export function MedicinePicker({
  onPick,
  placeholder = "Medicine er nam likho...",
}: {
  onPick: (medicine: PickedMedicine) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedMedicine[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Debounced so typing does not fire a query per keystroke.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchMedicines(query);
      if (cancelled) return;
      setResults(
        found.map((m) => ({
          id: String(m._id),
          name: m.name,
          genericName: m.genericName,
          patasPerBox: m.patasPerBox,
          boxPricePaisa: m.boxPricePaisa,
          pataPricePaisa: m.pataPricePaisa,
          stockPatas: m.stockPatas,
        })),
      );
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((medicine) => (
            <li key={medicine.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(medicine);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>
                  <span className="font-medium text-slate-900">{medicine.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {medicine.genericName}
                  </span>
                </span>
                <span className="text-xs text-slate-500">
                  {formatStock(medicine.stockPatas, medicine.patasPerBox)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the stock-in form**

Create `src/components/StockInForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stockIn } from "@/actions/stock";
import { formatStock } from "@/lib/units";
import { MedicinePicker, type PickedMedicine } from "./MedicinePicker";

export function StockInForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [medicine, setMedicine] = useState<PickedMedicine | null>(null);
  const [boxes, setBoxes] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!medicine) return;

    setBusy(true);
    setError("");
    setDone("");

    try {
      await stockIn({
        medicineId: medicine.id,
        boxes: Number(boxes),
        note,
        userId,
      });
      setDone(`${medicine.name} — ${boxes} box stock e dhuklo`);
      setMedicine(null);
      setBoxes("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Stock in</h2>

      {!medicine ? (
        <MedicinePicker onPick={setMedicine} />
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <div>
            <div className="text-sm font-medium text-slate-900">{medicine.name}</div>
            <div className="text-xs text-slate-500">
              Ekhon ache: {formatStock(medicine.stockPatas, medicine.patasPerBox)}
              {" · "}1 box = {medicine.patasPerBox} pata
            </div>
          </div>
          <button type="button" onClick={() => setMedicine(null)}
            className="text-xs text-slate-500 hover:text-red-600">
            Bodlao
          </button>
        </div>
      )}

      {medicine && (
        <>
          <div className="space-y-1">
            <label htmlFor="boxes" className="text-sm text-slate-700">Koto box dhuklo</label>
            <input id="boxes" type="number" min={1} value={boxes} required
              onChange={(e) => setBoxes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {boxes && Number(boxes) > 0 && (
              <p className="text-xs text-slate-500">
                = {Number(boxes) * medicine.patasPerBox} pata
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="note" className="text-sm text-slate-700">Note (optional)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <button type="submit" disabled={busy}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Wait..." : "Stock e dhukao"}
          </button>
        </>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">{done}</p>}
    </form>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(admin)/stock/page.tsx`:

```typescript
import { requireAdmin } from "@/lib/session";
import { listStockEntries } from "@/actions/stock";
import { StockInForm } from "@/components/StockInForm";

export default async function StockPage() {
  const session = await requireAdmin();
  const entries = await listStockEntries();

  return (
    <div className="space-y-6">
      <StockInForm userId={session.userId} />

      <div>
        <h2 className="mb-2 font-semibold text-slate-900">Ager stock entry</h2>
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-slate-500">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Medicine</th>
                <th className="p-3">Box</th>
                <th className="p-3">Pata</th>
                <th className="p-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    Ekhono kono stock entry nai.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={String(entry._id)} className="border-b border-slate-100">
                  <td className="p-3 text-slate-600">
                    {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                      timeZone: "Asia/Dhaka",
                    })}
                  </td>
                  <td className="p-3 font-medium text-slate-900">{entry.medicineName}</td>
                  <td className="p-3">{entry.boxes}</td>
                  <td className="p-3 text-slate-600">{entry.patasAdded}</td>
                  <td className="p-3 text-slate-500">{entry.note}</td>
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

- [ ] **Step 4: Verify the flow end to end**

```bash
npm run dev
```

At http://localhost:3000/stock:
- Type "nap" → "Napa 500mg" appears with its current stock
- Pick it, enter 50 boxes → the hint reads "= 500 pata"
- Submit → success message, and the entry appears in the table below
- Go to `/medicines` → Napa's stock column reads `50 box`
- Return to `/stock`, add 3 more boxes → `/medicines` now reads `53 box`
- Sell nothing; confirm no stock drift by re-checking the number

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, every test in every file.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(admin)/stock" src/components/StockInForm.tsx src/components/MedicinePicker.tsx
git commit -m "feat: add stock-in screen with medicine type-ahead"
```

---

### Task 13: Settings UI

**Files:**
- Create: `src/app/(admin)/settings/page.tsx`
- Create: `src/components/SettingsForm.tsx`

**Interfaces:**
- Consumes: `getSettings`, `updateSettings` (Task 5)
- Produces: the screen where the real company name replaces "ABC Pharmacy"

- [ ] **Step 1: Write the form**

Create `src/components/SettingsForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/actions/settings";

export function SettingsForm({
  initial,
}: {
  initial: {
    pharmacyName: string;
    address: string;
    phone: string;
    invoicePrefix: string;
  };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setDone(false);

    try {
      await updateSettings(values);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kichu ekta bhul holo");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <h1 className="font-semibold text-slate-900">Settings</h1>
      <p className="text-xs text-slate-500">
        Ei nam ta sob jaygay ar invoice e dekhabe.
      </p>

      <div className="space-y-1">
        <label htmlFor="pharmacyName" className="text-sm text-slate-700">Pharmacy-r nam</label>
        <input id="pharmacyName" className={field} required value={values.pharmacyName}
          onChange={(e) => setValues({ ...values, pharmacyName: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="address" className="text-sm text-slate-700">Address</label>
        <input id="address" className={field} value={values.address}
          onChange={(e) => setValues({ ...values, address: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="text-sm text-slate-700">Phone</label>
        <input id="phone" className={field} value={values.phone}
          onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </div>

      <div className="space-y-1">
        <label htmlFor="invoicePrefix" className="text-sm text-slate-700">Invoice prefix</label>
        <input id="invoicePrefix" className={field} required value={values.invoicePrefix}
          onChange={(e) => setValues({ ...values, invoicePrefix: e.target.value })} />
        <p className="text-xs text-slate-500">
          Invoice number eirokom hobe: {values.invoicePrefix || "ABC"}-000041
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm text-teal-700">Save hoyeche.</p>}

      <button type="submit" disabled={busy}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Wait..." : "Save"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(admin)/settings/page.tsx`:

```typescript
import { getSettings } from "@/actions/settings";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <SettingsForm
      initial={{
        pharmacyName: settings.pharmacyName,
        address: settings.address,
        phone: settings.phone,
        invoicePrefix: settings.invoicePrefix,
      }}
    />
  );
}
```

- [ ] **Step 3: Verify the name propagates**

```bash
npm run dev
```

At http://localhost:3000/settings:
- Change the name to "Test Pharmacy" and save → the nav header updates to "Test Pharmacy"
- Clear the name and save → error "Pharmacy name is required"
- Set the name back to "ABC Pharmacy"

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/settings" src/components/SettingsForm.tsx
git commit -m "feat: add settings screen for pharmacy identity"
```

---

## Done when

- The owner can log in at `/login` and is redirected away if not authenticated
- Medicines can be added and edited with a box rate, a pata rate, and a pack size
- Stock can be entered in boxes and displays as "49 box 8 pata" everywhere
- The pharmacy name lives in Settings and appears in the nav; changing it changes every screen
- `npm test` passes

## Next plans

- **Plan 2 — Sale:** retail sale, wholesale sale, invoice numbering, 80mm thermal invoice, due ledger, payments, reports, real dashboard
- **Plan 3 — Buyer portal:** buyer model and login, medicine browsing at box rate, cart and order submission, admin approval with the stock-deducting transaction
