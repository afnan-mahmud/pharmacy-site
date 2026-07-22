import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import {
  createBuyer,
  updateBuyer,
  setBuyerPassword,
  setBuyerActive,
  listBuyers,
  getBuyer,
} from "@/actions/buyers";
import { BuyerModel } from "@/models/Buyer";
import { verifyPassword } from "@/lib/auth";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

const karim = {
  name: "Karim Uddin",
  shopName: "Karim Medical Hall",
  phone: "01711111111",
  address: "Mirpur, Dhaka",
};

// Every action here is admin-only work, so every test needs a valid admin
// session unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("createBuyer", () => {
  it("creates an active buyer", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    expect(buyer.name).toBe("Karim Uddin");
    expect(buyer.shopName).toBe("Karim Medical Hall");
    expect(buyer.active).toBe(true);
  });

  it("hashes the password rather than storing it", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    const stored = await BuyerModel.findById(buyer._id);
    expect(stored!.passwordHash).not.toBe("secret123");
    expect(await verifyPassword("secret123", stored!.passwordHash)).toBe(true);
  });

  it("never returns the password hash to the caller", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    expect(buyer).not.toHaveProperty("passwordHash");
  });

  it("rejects an empty name", async () => {
    await expect(unwrap(createBuyer({ ...karim, name: "  " }, "secret123"))).rejects.toThrow(
      "Buyer er nam dorkar",
    );
  });

  it("rejects an empty phone", async () => {
    await expect(unwrap(createBuyer({ ...karim, phone: " " }, "secret123"))).rejects.toThrow(
      "Phone number dorkar",
    );
  });

  it("rejects a duplicate phone", async () => {
    await unwrap(createBuyer(karim, "secret123"));
    await expect(
      unwrap(createBuyer({ ...karim, name: "Onno keu" }, "secret123")),
    ).rejects.toThrow("already exists");
  });

  it("rejects a short password", async () => {
    await expect(unwrap(createBuyer(karim, "123"))).rejects.toThrow(
      "Password must be at least 6 characters",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(unwrap(createBuyer(karim, "secret123"))).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(createBuyer(karim, "secret123"))).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("listBuyers", () => {
  it("returns active buyers sorted by name", async () => {
    await unwrap(createBuyer({ ...karim, name: "Zahir", phone: "0172" }, "secret123"));
    await unwrap(createBuyer({ ...karim, name: "Abul", phone: "0173" }, "secret123"));
    const buyers = await listBuyers();
    expect(buyers.map((b) => b.name)).toEqual(["Abul", "Zahir"]);
  });

  it("excludes inactive buyers by default", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    await unwrap(setBuyerActive(buyer._id, false));
    expect(await listBuyers()).toHaveLength(0);
  });

  it("includes inactive buyers when asked", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    await unwrap(setBuyerActive(buyer._id, false));
    expect(await listBuyers(true)).toHaveLength(1);
  });

  it("never leaks password hashes", async () => {
    await unwrap(createBuyer(karim, "secret123"));
    const buyers = await listBuyers();
    expect(buyers[0]).not.toHaveProperty("passwordHash");
  });
});

describe("updateBuyer", () => {
  it("updates the shop name", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    const updated = await unwrap(updateBuyer(buyer._id, {
      ...karim,
      shopName: "Karim Pharmacy",
    }));
    expect(updated.shopName).toBe("Karim Pharmacy");
  });

  it("does not disturb the password", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    await unwrap(updateBuyer(buyer._id, { ...karim, name: "Karim U." }));
    const stored = await BuyerModel.findById(buyer._id);
    expect(await verifyPassword("secret123", stored!.passwordHash)).toBe(true);
  });

  it("throws for an unknown id", async () => {
    await expect(
      unwrap(updateBuyer("507f1f77bcf86cd799439011", karim)),
    ).rejects.toThrow("Buyer pawa jay ni");
  });

  it("throws for a malformed id", async () => {
    await expect(unwrap(updateBuyer("not-an-id", karim))).rejects.toThrow(
      "Buyer pawa jay ni",
    );
  });
});

describe("setBuyerPassword", () => {
  it("replaces the password", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    await unwrap(setBuyerPassword(buyer._id, "notun456"));
    const stored = await BuyerModel.findById(buyer._id);
    expect(await verifyPassword("notun456", stored!.passwordHash)).toBe(true);
    expect(await verifyPassword("secret123", stored!.passwordHash)).toBe(false);
  });

  it("rejects a short password", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    await expect(unwrap(setBuyerPassword(buyer._id, "12345"))).rejects.toThrow(
      "Password must be at least 6 characters",
    );
  });
});

describe("getBuyer", () => {
  it("returns the buyer without the hash", async () => {
    const buyer = await unwrap(createBuyer(karim, "secret123"));
    const found = await getBuyer(buyer._id);
    expect(found!.name).toBe("Karim Uddin");
    expect(found).not.toHaveProperty("passwordHash");
  });

  it("returns null for an unknown id", async () => {
    expect(await getBuyer("507f1f77bcf86cd799439011")).toBeNull();
  });

  it("returns null for a malformed id rather than throwing", async () => {
    expect(await getBuyer("not-an-id")).toBeNull();
  });
});
