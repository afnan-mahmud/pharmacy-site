import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
  buyerToken,
  BUYER_USER_ID,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import {
  createMedicine,
  updateMedicine,
  listMedicines,
  searchMedicines,
  toggleMedicineActive,
  deleteMedicine,
  listMedicinesPage,
} from "@/actions/medicines";
import {
  SOLD_MEDICINE_DELETE_ERROR,
  ORDERED_MEDICINE_DELETE_ERROR,
} from "@/lib/medicineReferences";
import { recordRetailSale, cancelSale, updateSale } from "@/actions/sales";
import { submitOrder } from "@/actions/buyerOrders";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";

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
  it("returns medicines sorted by name", async () => {
    await unwrap(createMedicine({ ...napa, name: "Zimax" }));
    await unwrap(createMedicine({ ...napa, name: "Ace" }));
    const list = await listMedicines();
    expect(list.map((m) => m.name)).toEqual(["Ace", "Zimax"]);
  });

  // The medicines admin table is the only screen a deactivated medicine can
  // be switched back on from, so the default listing must keep showing them.
  it("keeps deactivated medicines in the default listing", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(toggleMedicineActive(String(medicine._id), false));
    const list = await listMedicines();
    expect(list.map((m) => m.name)).toEqual([napa.name]);
    expect(list[0].active).toBe(false);
  });

  it("excludes deactivated medicines when activeOnly is set", async () => {
    const medicine = await unwrap(createMedicine(napa));
    await unwrap(createMedicine({ ...napa, name: "Zimax" }));
    await unwrap(toggleMedicineActive(String(medicine._id), false));
    const list = await listMedicines(undefined, true);
    expect(list.map((m) => m.name)).toEqual(["Zimax"]);
  });

  it("rejects a non-boolean activeOnly", async () => {
    await expect(
      listMedicines(undefined, "yes" as unknown as boolean),
    ).rejects.toThrow("activeOnly must be a boolean");
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

describe("toggleMedicineActive", () => {
  it("throws Medicine not found for a malformed id", async () => {
    await expect(unwrap(toggleMedicineActive("not-an-objectid", false))).rejects.toThrow(
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

  it("toggleMedicineActive rejects an unauthenticated caller", async () => {
    const medicine = await unwrap(createMedicine(napa));
    clearSessionCookie(cookieStore);
    await expect(unwrap(toggleMedicineActive(String(medicine._id), false))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });

  it("toggleMedicineActive rejects a buyer-role session", async () => {
    const medicine = await unwrap(createMedicine(napa));
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(toggleMedicineActive(String(medicine._id), false))).rejects.toThrow(
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

describe("expiryDate", () => {
  it("stores expiryDate when provided during creation", async () => {
    const medicine = await unwrap(
      createMedicine({
        ...napa,
        expiryDate: "2028-12-31",
      }),
    );
    expect(medicine.expiryDate).toBeDefined();
    expect(new Date(medicine.expiryDate!).getFullYear()).toBe(2028);
  });

  it("updates expiryDate on medicine update", async () => {
    const created = await unwrap(createMedicine(napa));
    expect(created.expiryDate).toBeFalsy();

    const updated = await unwrap(
      updateMedicine(created._id, {
        ...napa,
        expiryDate: "2027-06-15",
      }),
    );
    expect(updated.expiryDate).toBeDefined();
    expect(new Date(updated.expiryDate!).getFullYear()).toBe(2027);
  });

  it("rejects invalid expiry date format", async () => {
    await expect(
      unwrap(
        createMedicine({
          ...napa,
          expiryDate: "not-a-valid-date",
        }),
      ),
    ).rejects.toThrow("expiryDate thik na");
  });
});


/**
 * Denormalising the name and price onto a sale line keeps an old invoice
 * readable after the medicine is deleted, but reading is not all a sale has
 * to do: cancelling returns each line's stock and editing returns it before
 * deducting the new, and both abort when the medicine is gone. Deleting a
 * sold medicine used to freeze every sale containing it — uncancellable and
 * uneditable, permanently, including its due.
 */
describe("deleteMedicine", () => {
  async function stocked(overrides = {}) {
    const medicine = await unwrap(createMedicine({ ...napa, ...overrides }));
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $set: { stockPatas: 500 } },
    );
    return medicine;
  }

  it("deletes a medicine nothing refers to yet", async () => {
    const medicine = await stocked();

    await unwrap(deleteMedicine(medicine._id));

    expect(await MedicineModel.findById(medicine._id)).toBeNull();
  });

  it("refuses to delete a medicine that has been sold", async () => {
    const medicine = await stocked();
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    }));

    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow(
      SOLD_MEDICINE_DELETE_ERROR,
    );
    expect(await MedicineModel.findById(medicine._id)).not.toBeNull();
  });

  it("keeps a sold medicine's sale cancellable", async () => {
    const medicine = await stocked();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    }));

    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow();

    // The whole point: the sale still works afterwards.
    await unwrap(cancelSale(sale._id, "customer ferot diyeche"));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("keeps a sold medicine's sale editable", async () => {
    const medicine = await stocked();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    }));

    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow();

    const edited = await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 26000,
    }));
    expect(edited.totalPaisa).toBe(26000);
  });

  it("refuses even when the only sale was cancelled", async () => {
    const medicine = await stocked();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: { kind: "percent", percent: 0 },
      paidPaisa: 13000,
    }));
    await unwrap(cancelSale(sale._id, "test"));

    // salesReport reads the medicine back to recover a line's cost when none
    // was snapshotted, so deleting it would rewrite historical profit.
    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow(
      SOLD_MEDICINE_DELETE_ERROR,
    );
  });

  it("refuses to delete a medicine sitting in a pending order", async () => {
    const medicine = await stocked();
    // buyerToken() signs a token for BUYER_USER_ID, so the buyer document
    // must carry that exact _id for submitOrder to find it.
    await BuyerModel.create({
      _id: new mongoose.Types.ObjectId(BUYER_USER_ID),
      name: "Karim Uddin",
      shopName: "Karim Medical Hall",
      phone: "01733333333",
      address: "Mirpur",
      passwordHash: "x",
      active: true,
    });
    setSessionCookie(cookieStore, await buyerToken());
    await unwrap(submitOrder([{ medicineId: medicine._id, boxes: 1, patas: 0 }]));
    setSessionCookie(cookieStore, await adminToken());

    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow(
      ORDERED_MEDICINE_DELETE_ERROR,
    );
    expect(await MedicineModel.findById(medicine._id)).not.toBeNull();
  });

  it("throws for an unknown medicine", async () => {
    await expect(
      unwrap(deleteMedicine("507f1f77bcf86cd799439011")),
    ).rejects.toThrow("Medicine not found");
  });

  it("throws for a malformed id", async () => {
    await expect(unwrap(deleteMedicine("not-an-id"))).rejects.toThrow(
      "Medicine not found",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    const medicine = await stocked();
    clearSessionCookie(cookieStore);
    await expect(unwrap(deleteMedicine(medicine._id))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

/**
 * The medicines page used to hand the browser every medicine document and
 * filter them there. Paging that without moving the tab and form filters to
 * the server would have answered "the low-stock medicines that happen to be
 * on this page" — which looks exactly like a complete answer.
 */
describe("listMedicinesPage", () => {
  async function makeMany(count: number, overrides: (i: number) => object = () => ({})) {
    for (let i = 0; i < count; i++) {
      await unwrap(
        createMedicine({ ...napa, name: `Med ${String(i).padStart(3, "0")}`, ...overrides(i) }),
      );
    }
  }

  it("returns one page and the full total", async () => {
    await makeMany(55);

    const first = await listMedicinesPage({});
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(55);
    expect(first.pageSize).toBe(50);
    expect(first.page).toBe(1);

    const second = await listMedicinesPage({ page: 2 });
    expect(second.rows).toHaveLength(5);
    expect(second.page).toBe(2);
  });

  it("never repeats a row across pages", async () => {
    await makeMany(55);
    const first = await listMedicinesPage({ page: 1 });
    const second = await listMedicinesPage({ page: 2 });
    const ids = [...first.rows, ...second.rows].map((m) => m._id);
    expect(new Set(ids).size).toBe(55);
  });

  it("clamps a page past the end instead of returning nothing", async () => {
    await makeMany(3);
    const page = await listMedicinesPage({ page: 99 });
    expect(page.rows).toHaveLength(3);
    expect(page.page).toBe(1);
  });

  it("survives a malformed page number", async () => {
    await makeMany(3);
    for (const bad of [0, -1, 2.5, "2" as unknown as number]) {
      const page = await listMedicinesPage({ page: bad });
      expect(page.rows).toHaveLength(3);
    }
  });

  it("counts the tab badges over the whole catalogue, not the page", async () => {
    await makeMany(55);
    const page = await listMedicinesPage({});
    // 50 rows in hand, but the badge must still say 55.
    expect(page.rows).toHaveLength(50);
    expect(page.counts.all).toBe(55);
    expect(page.counts.active).toBe(55);
    expect(page.counts.inactive).toBe(0);
  });

  it("keeps the badge counts steady while a search narrows the rows", async () => {
    await makeMany(12);
    const page = await listMedicinesPage({ query: "Med 00" });
    expect(page.total).toBe(10); // Med 000..009
    expect(page.counts.all).toBe(12);
  });

  it("filters low stock on the server, across every page", async () => {
    await makeMany(55);
    const all = await listMedicinesPage({});
    // Put one low-stock medicine beyond the first page.
    const last = all.total;
    expect(last).toBe(55);
    await MedicineModel.updateOne({ name: "Med 000" }, { $set: { stockPatas: 0 } });

    const low = await listMedicinesPage({ tab: "low-stock" });
    expect(low.total).toBe(55); // every other medicine has 0 stock too
    expect(low.counts.lowStock).toBe(55);

    await MedicineModel.updateMany({}, { $set: { stockPatas: 500 } });
    await MedicineModel.updateOne({ name: "Med 054" }, { $set: { stockPatas: 0 } });
    const one = await listMedicinesPage({ tab: "low-stock" });
    expect(one.total).toBe(1);
    expect(one.rows[0]!.name).toBe("Med 054");
  });

  it("separates active from inactive", async () => {
    await makeMany(4);
    await MedicineModel.updateOne({ name: "Med 000" }, { $set: { active: false } });

    const active = await listMedicinesPage({ tab: "active" });
    const inactive = await listMedicinesPage({ tab: "inactive" });
    expect(active.total).toBe(3);
    expect(inactive.total).toBe(1);
    expect(inactive.rows[0]!.name).toBe("Med 000");
    expect(active.counts.inactive).toBe(1);
  });

  it("filters by dosage form", async () => {
    await makeMany(3);
    await unwrap(createMedicine({ ...napa, name: "Napa Syrup", form: "syrup" }));

    const syrup = await listMedicinesPage({ form: "syrup" });
    expect(syrup.total).toBe(1);
    expect(syrup.rows[0]!.name).toBe("Napa Syrup");
    // The form filter narrows rows but not the tab badges.
    expect(syrup.counts.all).toBe(4);
  });

  it("rejects an unknown tab", async () => {
    await expect(
      listMedicinesPage({ tab: "everything" as never }),
    ).rejects.toThrow("tab thik nai");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(listMedicinesPage({})).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("listMedicines caps the sale picker's search", () => {
  it("never returns more than the ceiling, even with an empty query", async () => {
    for (let i = 0; i < 105; i++) {
      await unwrap(createMedicine({ ...napa, name: `Cap ${String(i).padStart(3, "0")}` }));
    }
    // The picker opens with no query, which used to mean the whole catalogue.
    const all = await listMedicines();
    expect(all).toHaveLength(100);
  });

  it("clamps a limit sent from the client", async () => {
    for (let i = 0; i < 105; i++) {
      await unwrap(createMedicine({ ...napa, name: `Cap ${String(i).padStart(3, "0")}` }));
    }
    const huge = await listMedicines(undefined, false, 1_000_000);
    expect(huge).toHaveLength(100);
  });

  it("rejects a malformed limit", async () => {
    await expect(
      listMedicines(undefined, false, 0),
    ).rejects.toThrow("limit must be a whole number");
    await expect(
      listMedicines(undefined, false, 2.5),
    ).rejects.toThrow("limit must be a whole number");
  });
});

/**
 * Search used to be an unanchored case-insensitive regex over name and
 * genericName, which MongoDB cannot serve from an index — so every keystroke
 * in the sale picker scanned the whole collection. It now prefix-matches an
 * indexed array of words. These pin the behaviour that had to survive that
 * change, and the one that deliberately did not.
 */
