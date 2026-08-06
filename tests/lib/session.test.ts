import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { createSessionToken } from "@/lib/auth";
import {
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
  BUYER_USER_ID,
} from "../helpers/auth";
import { BuyerModel } from "@/models/Buyer";

// The admin guards never touch the database — they only read a cookie and
// verify a JWT — but the buyer guards do: a signed token proves who someone
// was at login, not that the owner has not switched the account off since
// (see buyerSessionProblem in src/lib/session.ts). So this file needs a
// database after all.
setupTestDb();

/**
 * buyerToken() signs for BUYER_USER_ID, so the document the guard looks up
 * has to carry that exact _id.
 */
async function makeSessionBuyer(overrides = {}) {
  return BuyerModel.create({
    _id: new mongoose.Types.ObjectId(BUYER_USER_ID),
    name: "Karim Uddin",
    phone: "01711111111",
    passwordHash: "x",
    active: true,
    ...overrides,
  });
}

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

// redirect() in real Next.js throws a special control-flow error rather than
// returning. Model that here so a test asserting "requireAdmin redirects"
// can't pass just because requireAdmin returned normally — if the code under
// test ever stopped calling redirect() and instead fell through, the mock
// wouldn't throw and the assertion on the resolved value (or lack of throw)
// would fail.
class RedirectError extends Error {
  constructor(public destination: string) {
    super(`REDIRECT:${destination}`);
  }
}

const redirectMock = vi.fn((destination: string) => {
  throw new RedirectError(destination);
});

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => redirectMock(destination),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSession", () => {
  it("returns null when no session cookie is present", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { getSession } = await import("@/lib/session");
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns null for a malformed/garbage cookie value", async () => {
    cookieStore.get.mockReturnValue({ value: "not-a-real-jwt" });
    const { getSession } = await import("@/lib/session");
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the payload for a valid token", async () => {
    const token = await createSessionToken({
      userId: "user-1",
      role: "admin",
      name: "Owner",
    });
    cookieStore.get.mockReturnValue({ value: token });
    const { getSession } = await import("@/lib/session");
    await expect(getSession()).resolves.toEqual({
      userId: "user-1",
      role: "admin",
      name: "Owner",
    });
  });
});

describe("requireAdmin", () => {
  it("redirects when there is no session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { requireAdmin } = await import("@/lib/session");

    await expect(requireAdmin()).rejects.toThrow(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects when the token is valid but carries role: buyer", async () => {
    const token = await createSessionToken({
      userId: "buyer-1",
      role: "buyer",
      name: "Some Wholesale Buyer",
    });
    cookieStore.get.mockReturnValue({ value: token });
    const { requireAdmin } = await import("@/lib/session");

    await expect(requireAdmin()).rejects.toThrow(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns the session for a valid admin token", async () => {
    const token = await createSessionToken({
      userId: "admin-1",
      role: "admin",
      name: "Owner",
    });
    cookieStore.get.mockReturnValue({ value: token });
    const { requireAdmin } = await import("@/lib/session");

    await expect(requireAdmin()).resolves.toEqual({
      userId: "admin-1",
      role: "admin",
      name: "Owner",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// requireAdminAction guards Server Actions, which are independently-callable
// POST endpoints reachable with no page render in flight — redirect() has no
// page to redirect *to* there, so this guard throws a plain Error instead
// (the same failure mode every action-calling component already displays via
// `err.message`). It must never call redirect(), and it must never fall back
// to requireAdmin()'s behavior silently.
describe("requireAdminAction", () => {
  it("throws (not redirects) when there is no session", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const { requireAdminAction } = await import("@/lib/session");

    await expect(requireAdminAction()).rejects.toThrow();
    await expect(requireAdminAction()).rejects.not.toThrow(RedirectError);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("throws when the token is valid but carries role: buyer", async () => {
    const token = await createSessionToken({
      userId: "buyer-1",
      role: "buyer",
      name: "Some Wholesale Buyer",
    });
    cookieStore.get.mockReturnValue({ value: token });
    const { requireAdminAction } = await import("@/lib/session");

    await expect(requireAdminAction()).rejects.toThrow();
    await expect(requireAdminAction()).rejects.not.toThrow(RedirectError);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the session for a valid admin token, same as requireAdmin", async () => {
    const token = await createSessionToken({
      userId: "admin-1",
      role: "admin",
      name: "Owner",
    });
    cookieStore.get.mockReturnValue({ value: token });
    const { requireAdminAction } = await import("@/lib/session");

    await expect(requireAdminAction()).resolves.toEqual({
      userId: "admin-1",
      role: "admin",
      name: "Owner",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// requireBuyerAction mirrors requireAdminAction exactly, for the buyer role:
// it guards a Server Action, so it throws (never redirects) when there's no
// buyer session.
describe("requireBuyerAction", () => {
  it("returns the session for a buyer token", async () => {
    await makeSessionBuyer();
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyerAction } = await import("@/lib/session");

    const session = await requireBuyerAction();
    expect(session.role).toBe("buyer");
  });

  it("throws for an admin token", async () => {
    setSessionCookie(cookieStore, await adminToken());
    const { requireBuyerAction, BUYER_ONLY_ERROR } = await import(
      "@/lib/session"
    );

    await expect(requireBuyerAction()).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("throws with no session", async () => {
    clearSessionCookie(cookieStore);
    const { requireBuyerAction, BUYER_ONLY_ERROR } = await import(
      "@/lib/session"
    );

    await expect(requireBuyerAction()).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

// requireBuyer mirrors requireAdmin: it's a page guard, so a non-buyer is
// redirected to the login page rather than thrown at.
describe("requireBuyer", () => {
  it("redirects an admin to the login page", async () => {
    setSessionCookie(cookieStore, await adminToken());
    const { requireBuyer } = await import("@/lib/session");

    await expect(requireBuyer()).rejects.toThrow(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("returns the session for a buyer", async () => {
    await makeSessionBuyer();
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyer } = await import("@/lib/session");

    const session = await requireBuyer();
    expect(session.role).toBe("buyer");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

/**
 * A session is a stateless 7-day JWT, so nothing the owner does — switching
 * an account off, resetting its password — reaches a token already in
 * someone's browser. These are what make that reachable.
 */
describe("buyer session revocation", () => {
  it("rejects a deactivated buyer's action", async () => {
    await makeSessionBuyer({ active: false });
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyerAction, BUYER_INACTIVE_ERROR } = await import(
      "@/lib/session"
    );

    await expect(requireBuyerAction()).rejects.toThrow(BUYER_INACTIVE_ERROR);
  });

  it("sends a deactivated buyer's page back to the login screen", async () => {
    await makeSessionBuyer({ active: false });
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyer } = await import("@/lib/session");

    // A revoked session is no more usable than no session, so it lands in
    // the same place rather than on an error screen.
    await expect(requireBuyer()).rejects.toThrow(RedirectError);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("rejects a session signed before the version moved", async () => {
    await makeSessionBuyer({ sessionVersion: 2 });
    setSessionCookie(
      cookieStore,
      await createSessionToken({
        userId: BUYER_USER_ID,
        role: "buyer",
        name: "Karim Uddin",
        sessionVersion: 1,
      }),
    );
    const { requireBuyerAction, BUYER_SESSION_STALE_ERROR } = await import(
      "@/lib/session"
    );

    await expect(requireBuyerAction()).rejects.toThrow(
      BUYER_SESSION_STALE_ERROR,
    );
  });

  it("accepts a session signed at the current version", async () => {
    await makeSessionBuyer({ sessionVersion: 2 });
    setSessionCookie(
      cookieStore,
      await createSessionToken({
        userId: BUYER_USER_ID,
        role: "buyer",
        name: "Karim Uddin",
        sessionVersion: 2,
      }),
    );
    const { requireBuyerAction } = await import("@/lib/session");

    const session = await requireBuyerAction();
    expect(session.role).toBe("buyer");
  });

  it("accepts a token with no version against a buyer still at zero", async () => {
    // Both sides predate the field. Nothing has been revoked, so nothing
    // should break for someone already signed in when this shipped.
    await makeSessionBuyer();
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyerAction } = await import("@/lib/session");

    await expect(requireBuyerAction()).resolves.toMatchObject({
      role: "buyer",
    });
  });

  it("rejects a token whose buyer no longer exists", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    const { requireBuyerAction, BUYER_INACTIVE_ERROR } = await import(
      "@/lib/session"
    );

    await expect(requireBuyerAction()).rejects.toThrow(BUYER_INACTIVE_ERROR);
  });
});
