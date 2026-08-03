/// <reference types="vite/client" />
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { createMockCookieStore, clearSessionCookie } from "../helpers/auth";
import { ADMIN_ONLY_ERROR, BUYER_ONLY_ERROR } from "@/lib/session";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

beforeEach(() => {
  clearSessionCookie(cookieStore);
});

/**
 * Structural guard test (Fix 5).
 *
 * The hole Fix 5 responds to (commit 4354aeb: "authenticate every Server
 * Action, not just page renders") was closed once already, and only a
 * convention — every action calls requireAdminAction() as its first line —
 * stops it from reopening. A convention did not prevent it the first time;
 * nothing here should rely on someone remembering to add a case for a new
 * action module or a new export.
 *
 * So this discovers, rather than lists by hand: `import.meta.glob` sweeps
 * every file under src/actions/ at test-collection time, and every function
 * that file exports is a candidate. A new module (e.g. the Sale plan's
 * src/actions/sales.ts, or the Buyer portal's order-approval action) is
 * swept in automatically the moment it exists — nobody has to remember to
 * wire it into this file for its exports to be held to the same bar.
 *
 * Every candidate is called with no arguments under a cleared session
 * cookie. That's deliberate, not an oversight: every action in this
 * codebase calls its guard (requireAdminAction, or nothing at all for the
 * two exemptions below) as the *first* line, before touching any argument
 * — so a correctly-guarded action rejects with ADMIN_ONLY_ERROR before ever
 * looking at what was passed in. An action that touches its arguments
 * before guarding — whether because the guard is missing entirely, or
 * because it was added below some other code — surfaces here as a
 * different rejection (e.g. a TypeError from destructuring `undefined`) or
 * a resolved promise, either of which fails the `.rejects.toThrow
 * (ADMIN_ONLY_ERROR)` assertion. That failure is the point: it means an
 * export exists that isn't provably guarded the same way as everything
 * else, which is exactly what should block a merge.
 */
const actionModules = import.meta.glob("/src/actions/*.ts", { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

// Two narrow, explicit exemptions, matched by exact module path + export
// name — nothing "inherits" an exemption by being in the same file or by
// pattern-matching a name. Anything added to an action module beyond these
// two must be guarded.
const EXEMPT: Record<string, string[]> = {
  "/src/actions/auth.ts": [
    // The only unauthenticated, network-reachable actions in the app.
    // login() cannot require a session — establishing one is the whole
    // point — and it is covered by its own dedicated tests (tests/actions/
    // auth.test.ts), including the username-enumeration and non-string-input
    // guarantees. logout() must be callable by anyone holding a cookie
    // (including an already-expired or malformed one) in order to clear it.
    "login",
    "logout",
    // Buyer equivalents — buyerLogin establishes a buyer session (so it can't
    // require one) and buyerLogout must be callable to clear a cookie. Covered
    // by their own tests in tests/actions/auth.test.ts.
    "buyerLogin",
    "buyerLogout",
  ],
  "/src/actions/settings.ts": [
    // Added by Fix 2: an unguarded, upsert-free read of pharmacy identity
    // fields. The spec requires every screen — including the not-yet-built
    // Buyer portal shell — to read the pharmacy name from Settings, so this
    // one read must not require an admin session. It performs no write
    // (updateSettings keeps requireAdminAction()) and is covered by its own
    // tests in tests/actions/settings.test.ts.
    "readSettings",
  ],
};

// Most action modules are admin-only. Buyer-portal modules reject with
// BUYER_ONLY_ERROR instead — same structural guarantee (every export refuses
// an unauthenticated caller before touching its arguments), different role.
const EXPECTED_ERROR: Record<string, string> = {
  "/src/actions/buyerOrders.ts": BUYER_ONLY_ERROR,
};

/**
 * A guarded action refuses an unauthenticated caller in one of two shapes.
 *
 * Read actions still throw. Mutating actions return their failure as data
 * instead, because Next.js redacts a thrown message in production (see
 * src/lib/actionResult.ts) — the guard message has to survive the trip to the
 * browser like any other.
 *
 * Both shapes are accepted, and nothing else is. A promise that resolves to
 * anything other than a failure carrying the expected message fails here, so
 * an unguarded export — which would resolve with real data, or reject with
 * some unrelated TypeError from touching its arguments — still cannot pass.
 */
async function expectRefusal(call: unknown, expected: string): Promise<void> {
  let resolved: unknown;
  try {
    resolved = await (call as Promise<unknown>);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(expected);
    return;
  }

  // Resolved: the only acceptable resolution is an ActionResult failure
  // carrying the guard's own message.
  expect(resolved).toMatchObject({ ok: false });
  expect((resolved as { error: string }).error).toContain(expected);
}

describe("every action module export requires an admin session", () => {
  const modulePaths = Object.keys(actionModules).sort();

  it("discovered at least the action modules known to exist today", () => {
    // A sanity check on the discovery mechanism itself: if this list ever
    // came back empty (e.g. the glob pattern stopped matching after a
    // repo-layout change), every test below would silently vanish instead
    // of failing loudly. This pins the count so that can't happen quietly.
    expect(modulePaths).toEqual([
      "/src/actions/adminOrders.ts",
      "/src/actions/auth.ts",
      "/src/actions/buyerOrders.ts",
      "/src/actions/buyers.ts",
      "/src/actions/dashboard.ts",
      "/src/actions/due.ts",
      "/src/actions/medicines.ts",
      "/src/actions/reports.ts",
      "/src/actions/retailCustomers.ts",
      "/src/actions/sales.ts",
      "/src/actions/settings.ts",
      "/src/actions/stock.ts",
    ]);
  });

  for (const path of modulePaths) {
    const mod = actionModules[path];
    const exemptions = EXEMPT[path] ?? [];

    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "function") continue;

      if (exemptions.includes(exportName)) {
        it.skip(`${path} → ${exportName}() is exempt (see EXEMPT above)`, () => {});
        continue;
      }

      it(`${path} → ${exportName}() refuses an unauthenticated caller`, async () => {
        const fn = value as (...args: unknown[]) => unknown;
        const expected = EXPECTED_ERROR[path] ?? ADMIN_ONLY_ERROR;
        await expectRefusal(fn(), expected);
      });
    }
  }
});
