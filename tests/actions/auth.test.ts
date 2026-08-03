import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { AdminUserModel } from "@/models/AdminUser";
import { BuyerModel } from "@/models/Buyer";
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
    // src/actions/auth.ts reads process.env.NODE_ENV at call time, so
    // vi.stubEnv lets us pin it per-test; vi.unstubAllEnvs() in `finally`
    // restores the original value so it can't leak into other tests in
    // this file. NODE_ENV is typed read-only by @types/node, so a direct
    // `process.env.NODE_ENV = ...` assignment doesn't type-check — stubEnv
    // is also the vitest-blessed way to do this.
    vi.stubEnv("NODE_ENV", "development");
    try {
      const { login } = await import("@/actions/auth");
      const result = await login("owner", "secret123");
      expect(result.ok).toBe(true);
      expect(cookieStore.set).toHaveBeenCalledOnce();

      const [name, , options] = cookieStore.set.mock.calls[0];
      expect(name).toBe("session");
      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sets secure: true on the session cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const { login } = await import("@/actions/auth");
      const result = await login("owner", "secret123");
      expect(result.ok).toBe(true);
      expect(cookieStore.set).toHaveBeenCalledOnce();

      const [name, , options] = cookieStore.set.mock.calls[0];
      expect(name).toBe("session");
      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    } finally {
      vi.unstubAllEnvs();
    }
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

  // Fix 3: login is the only unauthenticated, network-reachable action in
  // the app, and had the weakest input handling in the codebase — a
  // non-string username/password reached `.trim()`/bcrypt as a raw
  // TypeError instead of the standard failure result.
  it("gives the standard failure result (not a raw TypeError) for a non-string username", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login(123 as unknown as string, "secret123");
    expect(result).toEqual({ ok: false, error: "Username ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("gives the standard failure result (not a raw TypeError) for a non-string password", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login("owner", null as unknown as string);
    expect(result).toEqual({ ok: false, error: "Username ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  // A non-string input must not become a new distinguishable signal either:
  // it must produce the exact same result as any other failure mode.
  it("returns role: admin and redirectUrl: /dashboard for admin credentials", async () => {
    const { login } = await import("@/actions/auth");
    const result = await login("owner", "secret123");
    expect(result).toEqual({
      ok: true,
      role: "admin",
      redirectUrl: "/dashboard",
    });
  });

  it("authenticates a buyer with phone & password via unified login", async () => {
    await BuyerModel.create({
      name: "Karim Uddin",
      shopName: "Karim Medical Hall",
      phone: "01711111111",
      address: "Mirpur",
      passwordHash: await hashPassword("buyerPass123"),
      active: true,
    });

    const { login } = await import("@/actions/auth");
    const result = await login("01711111111", "buyerPass123");
    expect(result).toEqual({
      ok: true,
      role: "buyer",
      redirectUrl: "/buyer",
    });
    expect(cookieStore.set).toHaveBeenCalled();
  });
});

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
    const { buyerLogin } = await import("@/actions/auth");
    const result = await buyerLogin("01711111111", "secret123");
    expect(result.ok).toBe(true);
    expect(cookieStore.set).toHaveBeenCalledOnce();

    const [name, , options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("session");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("fails with a wrong password and sets no cookie", async () => {
    const { buyerLogin } = await import("@/actions/auth");
    const result = await buyerLogin("01711111111", "wrong");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("gives the same error for an unknown phone as a wrong password", async () => {
    const { buyerLogin } = await import("@/actions/auth");
    const unknown = await buyerLogin("01799999999", "secret123");
    const wrong = await buyerLogin("01711111111", "wrong");
    expect(unknown).toEqual(wrong);
  });

  it("refuses an inactive buyer with the same generic error", async () => {
    await BuyerModel.updateOne(
      { phone: "01711111111" },
      { $set: { active: false } },
    );
    const { buyerLogin } = await import("@/actions/auth");
    const result = await buyerLogin("01711111111", "secret123");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("fails a non-string input exactly like a wrong password", async () => {
    const { buyerLogin } = await import("@/actions/auth");
    // @ts-expect-error deliberately passing a non-string past the type boundary
    const result = await buyerLogin(12345, "secret123");
    expect(result).toEqual({ ok: false, error: "Phone ba password bhul" });
  });
});
