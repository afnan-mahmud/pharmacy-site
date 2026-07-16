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
