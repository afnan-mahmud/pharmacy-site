import { vi } from "vitest";
import mongoose from "mongoose";
import { createSessionToken } from "@/lib/auth";

/**
 * Fixed, valid ObjectId strings for the fake admin/buyer identities these
 * tests act as. A real session's `userId` always came from a Mongo
 * document (see login() in src/actions/auth.ts, which sets it to
 * `String(user._id)`), so a hand-crafted test session must be shaped the
 * same way — anything that isn't a valid ObjectId would exercise a
 * scenario (a malformed userId inside a signed, trusted session) that can
 * never happen for real.
 */
export const ADMIN_USER_ID = new mongoose.Types.ObjectId().toString();
export const BUYER_USER_ID = new mongoose.Types.ObjectId().toString();

export function adminToken(): Promise<string> {
  return createSessionToken({
    userId: ADMIN_USER_ID,
    role: "admin",
    name: "Test Admin",
  });
}

export function buyerToken(): Promise<string> {
  return createSessionToken({
    userId: BUYER_USER_ID,
    role: "buyer",
    name: "Test Buyer",
  });
}

export type MockCookieStore = { get: ReturnType<typeof vi.fn> };

/**
 * Builds the plain object a test file's own `vi.mock("next/headers", ...)`
 * factory closes over. vi.mock must be declared directly in the test file
 * for Vitest's hoisting to take effect (see tests/lib/session.test.ts and
 * tests/actions/auth.test.ts, which both do this already) — a helper
 * module cannot do that part on a test file's behalf. This just gives every
 * action test file the same small building blocks instead of re-deriving
 * them.
 */
export function createMockCookieStore(): MockCookieStore {
  return { get: vi.fn() };
}

export function setSessionCookie(store: MockCookieStore, token: string): void {
  store.get.mockReturnValue({ value: token });
}

export function clearSessionCookie(store: MockCookieStore): void {
  store.get.mockReturnValue(undefined);
}
