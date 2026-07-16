import { describe, it, expect, afterEach } from "vitest";
import { SignJWT } from "jose";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  readSessionToken,
} from "@/lib/auth";

// Signs a JWT directly with jose, using the same secret the app trusts, so we
// can hand-craft payloads that createSessionToken would never produce. This
// proves readSessionToken's guard rejects garbage even when the signature is
// valid — the actual attack the guard exists to stop.
function forgeToken(
  payload: Record<string, unknown>,
  options?: { expirationTime?: number | string },
): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(options?.expirationTime ?? "7d")
    .sign(secret);
}

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
    const a = await hashPassword("samesame");
    const b = await hashPassword("samesame");
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

describe("readSessionToken role guard against forged payloads", () => {
  // Every token above was built via createSessionToken with a valid role, so
  // the role/type guard inside readSessionToken was never actually exercised.
  // These tests forge validly-signed tokens with garbage payloads directly.

  it("rejects an unexpected role string", async () => {
    const token = await forgeToken({
      userId: "abc123",
      role: "superadmin",
      name: "Owner",
    });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token with role missing entirely", async () => {
    const token = await forgeToken({ userId: "abc123", name: "Owner" });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token whose role is a number", async () => {
    const token = await forgeToken({
      userId: "abc123",
      role: 1,
      name: "Owner",
    });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token whose role is an object", async () => {
    const token = await forgeToken({
      userId: "abc123",
      role: { admin: true },
      name: "Owner",
    });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token with userId missing entirely", async () => {
    const token = await forgeToken({ role: "admin", name: "Owner" });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token whose userId is not a string", async () => {
    const token = await forgeToken({ userId: 12345, role: "admin", name: "Owner" });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token with name missing entirely", async () => {
    const token = await forgeToken({ userId: "abc123", role: "admin" });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("rejects a token whose name is not a string", async () => {
    const token = await forgeToken({
      userId: "abc123",
      role: "admin",
      name: 42,
    });
    expect(await readSessionToken(token)).toBeNull();
  });

  it("returns null for an expired token rather than throwing", async () => {
    const token = await forgeToken(
      { userId: "abc123", role: "admin", name: "Owner" },
      { expirationTime: Math.floor(Date.now() / 1000) - 3600 },
    );
    expect(await readSessionToken(token)).toBeNull();
  });
});

describe("secretKey enforces a minimum SESSION_SECRET length", () => {
  const originalSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
  });

  it("throws a clear error when SESSION_SECRET is shorter than 32 characters", async () => {
    process.env.SESSION_SECRET = "too-short";
    await expect(
      createSessionToken({ userId: "abc123", role: "admin", name: "Owner" }),
    ).rejects.toThrow(/32/);
  });

  it("throws when SESSION_SECRET is exactly 31 characters (boundary)", async () => {
    process.env.SESSION_SECRET = "a".repeat(31);
    await expect(
      createSessionToken({ userId: "abc123", role: "admin", name: "Owner" }),
    ).rejects.toThrow(/32/);
  });

  it("accepts a SESSION_SECRET of exactly 32 characters (boundary)", async () => {
    process.env.SESSION_SECRET = "a".repeat(32);
    const token = await createSessionToken({
      userId: "abc123",
      role: "admin",
      name: "Owner",
    });
    expect(await readSessionToken(token)).toMatchObject({
      userId: "abc123",
      role: "admin",
      name: "Owner",
    });
  });
});
