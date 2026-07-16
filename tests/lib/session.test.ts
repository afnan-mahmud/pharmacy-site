import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionToken } from "@/lib/auth";

// No setupTestDb() here: getSession/requireAdmin never touch the database,
// they only read a cookie and verify a JWT. Pulling in the in-memory Mongo
// replica set would be pure overhead for this file.

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
