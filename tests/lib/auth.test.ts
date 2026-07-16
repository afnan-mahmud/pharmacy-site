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
