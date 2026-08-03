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
  createRetailCustomer,
  renameRetailCustomer,
  listRetailCustomers,
} from "@/actions/retailCustomers";
import { RetailCustomerModel } from "@/models/RetailCustomer";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

const jamal = { name: "Jamal Hossain", phone: "01711111111" };

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("createRetailCustomer", () => {
  it("creates a customer", async () => {
    const customer = await unwrap(createRetailCustomer(jamal));
    expect(customer.name).toBe("Jamal Hossain");
    expect(customer.phone).toBe("01711111111");
  });

  it("trims the name and the phone", async () => {
    const customer = await unwrap(
      createRetailCustomer({ name: "  Jamal  ", phone: "  0171  " }),
    );
    expect(customer.name).toBe("Jamal");
    expect(customer.phone).toBe("0171");
  });

  it("rejects an empty name", async () => {
    await expect(
      unwrap(createRetailCustomer({ ...jamal, name: "  " })),
    ).rejects.toThrow("Customer er nam dorkar");
  });

  it("rejects an empty phone", async () => {
    await expect(
      unwrap(createRetailCustomer({ ...jamal, phone: " " })),
    ).rejects.toThrow("Phone number dorkar");
  });

  // One phone, one customer — the same rule the retail counter's upsert
  // relies on, enforced here by the unique index.
  it("rejects a duplicate phone", async () => {
    await unwrap(createRetailCustomer(jamal));
    await expect(
      unwrap(createRetailCustomer({ ...jamal, name: "Onno keu" })),
    ).rejects.toThrow("already exists");
  });

  it("refuses a buyer session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(createRetailCustomer(jamal))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

describe("renameRetailCustomer", () => {
  it("changes the name", async () => {
    const created = await unwrap(createRetailCustomer(jamal));
    const renamed = await unwrap(
      renameRetailCustomer(created._id, "Jamal Uddin"),
    );
    expect(renamed.name).toBe("Jamal Uddin");
  });

  // The phone is what every Sale and RetailPayment is keyed by, so a rename
  // must never move it.
  it("leaves the phone untouched", async () => {
    const created = await unwrap(createRetailCustomer(jamal));
    await unwrap(renameRetailCustomer(created._id, "Jamal Uddin"));
    const stored = await RetailCustomerModel.findById(created._id);
    expect(stored!.phone).toBe("01711111111");
  });

  it("rejects an empty name", async () => {
    const created = await unwrap(createRetailCustomer(jamal));
    await expect(
      unwrap(renameRetailCustomer(created._id, "   ")),
    ).rejects.toThrow("Customer er nam dorkar");
  });

  it("rejects an unknown id", async () => {
    await expect(
      unwrap(renameRetailCustomer("64b7f0000000000000000000", "Keu")),
    ).rejects.toThrow("Customer pawa jay ni");
  });

  it("rejects a malformed id", async () => {
    await expect(renameRetailCustomer("not-an-id", "Keu")).resolves.toEqual({
      ok: false,
      error: "Customer pawa jay ni",
    });
  });
});

describe("listRetailCustomers", () => {
  it("returns an empty list when there are none", async () => {
    expect(await listRetailCustomers()).toEqual([]);
  });

  it("returns every customer sorted by name", async () => {
    await unwrap(createRetailCustomer({ name: "Rahim", phone: "0182" }));
    await unwrap(createRetailCustomer({ name: "Jamal", phone: "0171" }));
    await unwrap(createRetailCustomer({ name: "Shathi", phone: "0193" }));

    const names = (await listRetailCustomers()).map((c) => c.name);
    expect(names).toEqual(["Jamal", "Rahim", "Shathi"]);
  });

  it("returns plain, serializable objects", async () => {
    await unwrap(createRetailCustomer(jamal));
    const [customer] = await listRetailCustomers();
    expect(typeof customer._id).toBe("string");
    expect(JSON.parse(JSON.stringify(customer))).toEqual(customer);
  });

  it("refuses an unauthenticated visitor", async () => {
    clearSessionCookie(cookieStore);
    await expect(listRetailCustomers()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
