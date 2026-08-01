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
  createMedicine,
  updateMedicine,
  listMedicines,
  searchMedicines,
  deactivateMedicine,
} from "@/actions/medicines";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

// Every action in this file is admin-only work, so every test needs a valid
// admin session present unless it is specifically testing the guard itself.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  purchasePricePaisa: 9000,
  wholesaleBoxPricePaisa: 12000,
  wholesalePataPricePaisa: 1300,
  retailBoxPricePaisa: 13000,
  retailPataPricePaisa: 1400,
  lowStockThreshold: 20,
};

describe("createMedicine", () => {
  it("creates a medicine with zero stock", async () => {
    const medicine = await unwrap(createMedicine(napa));
    expect(medicine.name).toBe("Napa 500mg");
    expect(medicine.stockPatas).toBe(0);
    expect(medicine.active).toBe(true);
  });

  it("stores all four channel rates and the purchase rate", async () => {
    const medicine = await unwrap(createMedicine(napa));
    expect(medicine.purchasePricePaisa).toBe(9000);
    expect(medicine.wholesaleBoxPricePaisa).toBe(12000);
    expect(medicine.wholesalePataPricePaisa).toBe(1300);
    expect(medicine.retailBoxPricePaisa).toBe(13000);
    expect(medicine.retailPataPricePaisa).toBe(1400);
  });

  it("defaults purchasePricePaisa to 0 when omitted", async () => {
    const { purchasePricePaisa, ...rest } = napa;
    const medicine = await unwrap(createMedicine(rest as unknown as typeof napa));
    expect(medicine.purchasePricePaisa).toBe(0);
  });

  it("rejects an empty name", async () => {
    await expect(unwrap(createMedicine({ ...napa, name: "  " }))).rejects.toThrow(
      "Medicine name is required",
    );
  });

  it("rejects a duplicate name", async () => {
    await unwrap(createMedicine(napa));
    await expect(unwrap(createMedicine(napa))).rejects.toThrow("already exists");
  });

  it("treats duplicate names case-insensitively", async () => {
    await unwrap(createMedicine(napa));
    await expect(
      unwrap(createMedicine({ ...napa, name: "NAPA 500MG" })),
    ).rejects.toThrow("already exists");
  });

  it("rejects patasPerBox below 1", async () => {
    await expect(unwrap(createMedicine({ ...napa, patasPerBox: 0 }))).rejects.toThrow(
      "patasPerBox must be at least 1",
    );
  });

  it.each([
    "wholesaleBoxPricePaisa",
    "wholesalePataPricePaisa",
    "retailBoxPricePaisa",
    "retailPataPricePaisa",
  ] as const)("rejects a negative %s", async (field) => {
    await expect(
      unwrap(createMedicine({ ...napa, [field]: -1 })),
    ).rejects.toThrow("cannot be negative");
  });

  it.each([
    "wholesaleBoxPricePaisa",
    "wholesalePataPricePaisa",
    "retailBoxPricePaisa",
    "retailPataPricePaisa",
  ] as const)("rejects a non-integer %s", async (field) => {
    await expect(
      unwrap(createMedicine({ ...napa, [field]: 100.5 })),
    ).rejects.toThrow("whole number");
  });

  it.each([
    "wholesaleBoxPricePaisa",
    "wholesalePataPricePaisa",
    "retailBoxPricePaisa",
    "retailPataPricePaisa",
  ] as const)("rejects an Infinity %s", async (field) => {
    await expect(
      unwrap(createMedicine({ ...napa, [field]: Infinity })),
    ).rejects.toThrow("whole number");
  });

  it.each([
    "wholesaleBoxPricePaisa",
    "wholesalePataPricePaisa",
    "retailBoxPricePaisa",
    "retailPataPricePaisa",
  ] as const)("rejects a NaN %s", async (field) => {
    await expect(
      unwrap(createMedicine({ ...napa, [field]: NaN })),
    ).rejects.toThrow("whole number");
  });

  it("rejects a negative purchasePricePaisa when provided", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, purchasePricePaisa: -1 })),
    ).rejects.toThrow("cannot be negative");
  });

  it("rejects a non-integer lowStockThreshold", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, lowStockThreshold: 2.5 })),
    ).rejects.toThrow("whole number");
  });

  it("rejects a non-integer patasPerBox", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, patasPerBox: 2.5 })),
    ).rejects.toThrow("patasPerBox must be at least 1");
  });

  it("rejects a NaN patasPerBox", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, patasPerBox: NaN })),
    ).rejects.toThrow("patasPerBox must be at least 1");
  });

  it("rejects a non-string name", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, name: 12345 as unknown as string })),
    ).rejects.toThrow("Medicine name is required");
  });

  it("defaults a missing genericName and company to an empty string", async () => {
    const { genericName, company, ...rest } = napa;
    const medicine = await unwrap(createMedicine(rest as unknown as typeof napa));
    expect(medicine.genericName).toBe("");
    expect(medicine.company).toBe("");
  });

  it("defaults a null genericName and company to an empty string", async () => {
    const medicine = await unwrap(createMedicine({
      ...napa,
      genericName: null as unknown as string,
      company: null as unknown as string,
    }));
    expect(medicine.genericName).toBe("");
    expect(medicine.company).toBe("");
  });

  it("accepts an MRP at or above the wholesale box rate", async () => {
    const medicine = await unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 12000 }));
    expect(medicine.mrpBoxPricePaisa).toBe(12000);
  });

  it("rejects an MRP below the wholesale box rate", async () => {
    await expect(
      unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 11000 })),
    ).rejects.toThrow("MRP pack rate er cheye kom hote parbe na");
  });

  it("allows 0 as the no-MRP sentinel regardless of the wholesale box rate", async () => {
    const medicine = await unwrap(createMedicine({ ...napa, mrpBoxPricePaisa: 0 }));
    expect(medicine.mrpBoxPricePaisa).toBe(0);
  });
});

describe("listMedicines", () => {
  it("returns active medicines sorted by name", async () => {
    await unwrap(createMedicine({ ...napa, name: "Zimax" }));
    await unwrap(createMedicine({ ...napa, name: "Ace" }));
    const list = await listMedicines();
    expect(list.map((m) => m.name)).toEqual(["Ace", "Zimax"]);
  });

  it("excludes deactivated medicines", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(deactivateMedicine(String(medicine._id)));
    expect(await listMedicines()).toHaveLength(0);
  });

  it("filters by a name query", async () => {
    await unwrap(createMedicine({ ...napa, name: "Napa Extra" }));
    await unwrap(createMedicine({ ...napa, name: "Zimax" }));
    const list = await listMedicines("napa");
    expect(list.map((m) => m.name)).toEqual(["Napa Extra"]);
  });

  it("does not leak a regex from the query into the match", async () => {
    await unwrap(createMedicine(napa));
    // A user typing ".*" must not match everything.
    expect(await listMedicines(".*")).toEqual([]);
  });

  it("rejects a non-string query", async () => {
    await expect(
      listMedicines(12345 as unknown as string),
    ).rejects.toThrow("query must be a string");
  });
});

describe("searchMedicines", () => {
  it("matches on a partial name, case-insensitively", async () => {
    await unwrap(createMedicine(napa));
    const results = await searchMedicines("nap");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Napa 500mg");
  });

  it("matches on the generic name", async () => {
    await unwrap(createMedicine(napa));
    const results = await searchMedicines("paracet");
    expect(results).toHaveLength(1);
  });

  it("returns nothing for an empty query", async () => {
    await unwrap(createMedicine(napa));
    expect(await searchMedicines("")).toEqual([]);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 15; i++) {
      await unwrap(createMedicine({ ...napa, name: `Napa ${i}` }));
    }
    expect(await searchMedicines("napa", 10)).toHaveLength(10);
  });

  it("does not leak a regex from the query into the match", async () => {
    await unwrap(createMedicine(napa));
    // A user typing ".*" must not match everything.
    expect(await searchMedicines(".*")).toEqual([]);
  });

  it("rejects a non-string query", async () => {
    await expect(
      searchMedicines(12345 as unknown as string),
    ).rejects.toThrow("query must be a string");
  });

  it("rejects a null query", async () => {
    await expect(
      searchMedicines(null as unknown as string),
    ).rejects.toThrow("query must be a string");
  });
});

describe("updateMedicine", () => {
  it("updates prices", async () => {
    const medicine = await unwrap(createMedicine(napa));
    const updated = await unwrap(updateMedicine(String(medicine._id), {
      ...napa,
      wholesaleBoxPricePaisa: 13000,
    }));
    expect(updated.wholesaleBoxPricePaisa).toBe(13000);
  });

  it("does not touch stock", async () => {
    const medicine = await unwrap(createMedicine(napa));
    const updated = await unwrap(updateMedicine(String(medicine._id), {
      ...napa,
      name: "Napa 665mg",
    }));
    expect(updated.stockPatas).toBe(0);
  });

  it("throws for an unknown id", async () => {
    await expect(
      unwrap(updateMedicine("507f1f77bcf86cd799439011", napa)),
    ).rejects.toThrow("Medicine not found");
  });

  it("throws Medicine not found for a malformed id", async () => {
    await expect(
      unwrap(updateMedicine("not-an-objectid", napa)),
    ).rejects.toThrow("Medicine not found");
  });

  it("rejects invalid input, same as createMedicine", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await expect(
      unwrap(updateMedicine(String(medicine._id), { ...napa, wholesaleBoxPricePaisa: -1 })),
    ).rejects.toThrow("cannot be negative");
  });
});

describe("deactivateMedicine", () => {
  it("throws Medicine not found for a malformed id", async () => {
    await expect(unwrap(deactivateMedicine("not-an-objectid"))).rejects.toThrow(
      "Medicine not found",
    );
  });
});

// These medicine actions are network-reachable Server Actions with no page
// render in front of them — an unauthenticated (or buyer-role) caller must
// never be able to invoke them. This is the whole point of this suite: it
// must fail against a version of src/actions/medicines.ts that doesn't call
// requireAdminAction().
describe("authorization", () => {
  it("createMedicine rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(unwrap(createMedicine(napa))).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("createMedicine rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(createMedicine(napa))).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("updateMedicine rejects an unauthenticated caller", async () => {
    const medicine = await unwrap(createMedicine(napa));
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(updateMedicine(String(medicine._id), napa)),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("updateMedicine rejects a buyer-role session", async () => {
    const medicine = await unwrap(createMedicine(napa));
    setSessionCookie(cookieStore, await buyerToken());
    await expect(
      unwrap(updateMedicine(String(medicine._id), napa)),
    ).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("listMedicines rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(listMedicines()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("listMedicines rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(listMedicines()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("searchMedicines rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(searchMedicines("napa")).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("searchMedicines rejects a buyer-role session", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(searchMedicines("napa")).rejects.toThrow(ADMIN_ONLY_ERROR);
  });

  it("deactivateMedicine rejects an unauthenticated caller", async () => {
    const medicine = await unwrap(createMedicine(napa));
    clearSessionCookie(cookieStore);
    await expect(unwrap(deactivateMedicine(String(medicine._id)))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });

  it("deactivateMedicine rejects a buyer-role session", async () => {
    const medicine = await unwrap(createMedicine(napa));
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(deactivateMedicine(String(medicine._id)))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

describe("medicine form", () => {
  it("defaults to tablet when no form is given", async () => {
    const medicine = await unwrap(createMedicine(napa));
    expect(medicine.form).toBe("tablet");
  });

  it("stores the form it is given", async () => {
    const medicine = await unwrap(createMedicine({
      ...napa,
      name: "Napa Syrup",
      form: "syrup",
    }));
    expect(medicine.form).toBe("syrup");
  });

  it("rejects a form that is not one of the known ones", async () => {
    await expect(
      unwrap(createMedicine({
        ...napa,
        name: "Weird",
        // Deliberately invalid: this is a network-reachable boundary and the
        // payload does not have to come from our own form picker.
        form: "ointment" as never,
      })),
    ).rejects.toThrow("Medicine form thik nai");
  });

  it("lets an edit change the form without touching stock", async () => {
    const created = await unwrap(createMedicine(napa));
    const updated = await unwrap(updateMedicine(created._id, {
      ...napa,
      form: "syrup",
    }));
    expect(updated.form).toBe("syrup");
    expect(updated.stockPatas).toBe(created.stockPatas);
  });

  it("resets an edited medicine to tablet when the form is omitted", async () => {
    const created = await unwrap(createMedicine({ ...napa, form: "syrup" }));
    const updated = await unwrap(updateMedicine(created._id, napa));
    expect(updated.form).toBe("tablet");
  });
});
