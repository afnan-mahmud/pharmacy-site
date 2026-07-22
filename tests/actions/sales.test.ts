import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { createMedicine } from "@/actions/medicines";
import { recordRetailSale, recordWholesaleSale, cancelSale } from "@/actions/sales";
import { createBuyer } from "@/actions/buyers";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";
import { SettingsModel } from "@/models/Settings";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

const napa = {
  name: "Napa 500mg",
  genericName: "Paracetamol",
  company: "Beximco",
  patasPerBox: 10,
  boxPricePaisa: 12000,
  pataPricePaisa: 1400,
  lowStockThreshold: 20,
};

async function makeMedicine(overrides = {}, stockPatas = 500) {
  const medicine = await createMedicine({ ...napa, ...overrides });
  await MedicineModel.updateOne({ _id: medicine._id }, { $set: { stockPatas } });
  return medicine;
}

async function makeBuyer(overrides = {}) {
  return createBuyer(
    {
      name: "Karim Uddin",
      shopName: "Karim Medical Hall",
      phone: `017${Math.floor(Math.random() * 100000000)}`,
      address: "Mirpur",
      ...overrides,
    },
    "secret123",
  );
}

// Every action here is admin-only work, so every test needs a valid admin
// session unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("recordRetailSale", () => {
  it("charges the pata rate and deducts patas", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
    });

    expect(sale.type).toBe("retail");
    expect(sale.totalPaisa).toBe(2800);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(498);
  });

  it("is always paid in full with no due", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
    });
    expect(sale.paidPaisa).toBe(2800);
    expect(sale.duePaisa).toBe(0);
  });

  it("assigns no invoice number", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
    });
    expect(sale.invoiceNo).toBeNull();
  });

  it("allows a second retail sale without colliding on invoiceNo (regression: a sparse unique index does not skip explicit nulls)", async () => {
    const medicine = await makeMedicine({}, 100);
    const first = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
    });
    const second = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
    });
    expect(first.invoiceNo).toBeNull();
    expect(second.invoiceNo).toBeNull();
    expect(await SaleModel.countDocuments({ type: "retail" })).toBe(2);
  });

  it("has no buyer", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
    });
    expect(sale.buyerId).toBeNull();
  });

  it("snapshots the medicine name and rate onto the line", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
    });
    expect(sale.items[0].medicineName).toBe("Napa 500mg");
    expect(sale.items[0].ratePaisa).toBe(1400);
    expect(sale.items[0].unit).toBe("pata");
    expect(sale.items[0].patasDeducted).toBe(2);
  });

  it("does not rewrite a past sale when the price later changes", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
    });
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $set: { pataPricePaisa: 9900 } },
    );
    const stored = await SaleModel.findById(sale._id);
    expect(stored!.items[0].ratePaisa).toBe(1400);
    expect(stored!.totalPaisa).toBe(2800);
  });

  it("handles multiple lines", async () => {
    const a = await makeMedicine();
    const b = await makeMedicine({ name: "Ace", pataPricePaisa: 1000 });
    const sale = await recordRetailSale({
      items: [
        { medicineId: a._id, patas: 2 },
        { medicineId: b._id, patas: 3 },
      ],
    });
    expect(sale.totalPaisa).toBe(2800 + 3000);
    expect(sale.items).toHaveLength(2);
  });

  it("refuses to sell more than the stock and changes nothing", async () => {
    const medicine = await makeMedicine({}, 5);
    await expect(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 6 }] }),
    ).rejects.toThrow("Napa 500mg — stock e ache 5 pata, lagbe 6 pata");

    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(5);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("rolls back every line when a later line is short", async () => {
    // The whole sale must be atomic: the first medicine's stock must not
    // stay deducted because the second one failed.
    const a = await makeMedicine({}, 500);
    const b = await makeMedicine({ name: "Ace" }, 1);

    await expect(
      recordRetailSale({
        items: [
          { medicineId: a._id, patas: 2 },
          { medicineId: b._id, patas: 5 },
        ],
      }),
    ).rejects.toThrow("stock e ache");

    expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(500);
    expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(1);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("stock can never go negative through this path", async () => {
    const medicine = await makeMedicine({}, 3);
    await expect(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 1000 }] }),
    ).rejects.toThrow();
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBeGreaterThanOrEqual(0);
  });

  it("rejects an empty sale", async () => {
    await expect(recordRetailSale({ items: [] })).rejects.toThrow(
      "Cart khali",
    );
  });

  it("rejects a zero quantity", async () => {
    const medicine = await makeMedicine();
    await expect(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 0 }] }),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects a fractional quantity", async () => {
    const medicine = await makeMedicine();
    await expect(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 1.5 }] }),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects a malformed medicine id", async () => {
    await expect(
      recordRetailSale({ items: [{ medicineId: "not-an-id", patas: 1 }] }),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("rejects an unknown medicine", async () => {
    await expect(
      recordRetailSale({
        items: [{ medicineId: "507f1f77bcf86cd799439011", patas: 1 }],
      }),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("rejects the same medicine listed twice", async () => {
    // Two lines for one medicine would each check stock independently and
    // could together oversell it.
    const medicine = await makeMedicine({}, 3);
    await expect(
      recordRetailSale({
        items: [
          { medicineId: medicine._id, patas: 2 },
          { medicineId: medicine._id, patas: 2 },
        ],
      }),
    ).rejects.toThrow("ekbar er beshi");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      recordRetailSale({ items: [{ medicineId: "507f1f77bcf86cd799439011", patas: 1 }] }),
    ).rejects.toThrow();
  });
});

describe("recordWholesaleSale", () => {
  it("charges the box rate and deducts boxes worth of patas", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPercent: 0,
      paidPaisa: 36000,
    });

    expect(sale.type).toBe("wholesale");
    expect(sale.totalPaisa).toBe(36000);
    expect(sale.items[0].unit).toBe("box");
    expect(sale.items[0].quantity).toBe(3);
    expect(sale.items[0].ratePaisa).toBe(12000);
    expect(sale.items[0].patasDeducted).toBe(30);

    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(470);
  });

  it("assigns a sequential invoice number using the settings prefix", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const line = { medicineId: medicine._id, boxes: 1 };

    const first = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [line],
      discountPercent: 0,
      paidPaisa: 12000,
    });
    const second = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [line],
      discountPercent: 0,
      paidPaisa: 12000,
    });

    expect(first.invoiceNo).toBe("ABC-000001");
    expect(second.invoiceNo).toBe("ABC-000002");
  });

  it("uses a changed invoice prefix", async () => {
    await SettingsModel.findOneAndUpdate(
      { key: "singleton" },
      { $set: { invoicePrefix: "RP" } },
      { upsert: true },
    );
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 12000,
    });
    expect(sale.invoiceNo).toBe("RP-000001");
  });

  it("records a part payment as a due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPercent: 0,
      paidPaisa: 20000,
    });

    expect(sale.totalPaisa).toBe(36000);
    expect(sale.paidPaisa).toBe(20000);
    expect(sale.duePaisa).toBe(16000);
  });

  it("takes a percentage off the total and stores both figures", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPercent: 10,
      paidPaisa: 0,
    });

    expect(sale.subtotalPaisa).toBe(36000);
    // The percent as agreed, and the paisa it actually worked out to.
    expect(sale.discountPercent).toBe(10);
    expect(sale.discountPaisa).toBe(3600);
    expect(sale.totalPaisa).toBe(32400);
    expect(sale.duePaisa).toBe(32400);
  });

  it("accepts a fractional percentage", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPercent: 2.5,
      paidPaisa: 0,
    });

    expect(sale.discountPercent).toBe(2.5);
    expect(sale.discountPaisa).toBe(900);
    expect(sale.totalPaisa).toBe(35100);
  });

  it("defaults an old-style sale to no percentage", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 0,
    });

    expect(sale.discountPercent).toBe(0);
    expect(sale.discountPaisa).toBe(0);
  });

  it("snapshots the buyer name and shop onto the sale", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 12000,
    });
    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerShopName).toBe("Karim Medical Hall");
  });

  it("refuses to sell more boxes than the stock covers, and changes nothing", async () => {
    const medicine = await makeMedicine({}, 25); // 2 boxes and 5 patas
    const buyer = await makeBuyer();

    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 3 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("stock e ache");

    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(25);
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("burns the invoice number rather than reusing it after a failure", async () => {
    const good = await makeMedicine({}, 500);
    const short = await makeMedicine({ name: "Ace" }, 0);
    const buyer = await makeBuyer();

    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: short._id, boxes: 1 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow();

    const after = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: good._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 12000,
    });

    // The number the failed attempt would have taken must never appear on a
    // second sale. Whatever it is, it must be unique.
    const all = await SaleModel.find({ invoiceNo: { $ne: null } });
    const numbers = all.map((s) => s.invoiceNo);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(after.invoiceNo).toBeTruthy();
  });

  it("rejects an unknown buyer", async () => {
    const medicine = await makeMedicine();
    await expect(
      recordWholesaleSale({
        buyerId: "507f1f77bcf86cd799439011",
        items: [{ medicineId: medicine._id, boxes: 1 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Buyer pawa jay ni");
  });

  it("rejects an inactive buyer", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const { setBuyerActive } = await import("@/actions/buyers");
    await setBuyerActive(buyer._id, false);

    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Buyer ta bondho ache");
  });

  it("rejects a discount above a hundred percent", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1 }],
        discountPercent: 101,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Discount 0 theke 100 er moddhe hote hobe");
  });

  it("rejects a negative discount percentage", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1 }],
        discountPercent: -1,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Discount 0 theke 100 er moddhe hote hobe");
  });

  it("allows a hundred percent discount, leaving nothing to pay", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 100,
      paidPaisa: 0,
    });
    expect(sale.totalPaisa).toBe(0);
    expect(sale.duePaisa).toBe(0);
  });

  it("rejects paying more than the total", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1 }],
        discountPercent: 0,
        paidPaisa: 99999,
      }),
    ).rejects.toThrow("Joma taka total er cheye beshi hote parbe na");
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      recordWholesaleSale({
        buyerId: "507f1f77bcf86cd799439011",
        items: [{ medicineId: "507f1f77bcf86cd799439011", boxes: 1 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow();
  });
});

describe("cancelSale", () => {
  it("returns the stock the sale took", async () => {
    const medicine = await makeMedicine({}, 500);
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3 }],
      discountPercent: 0,
      paidPaisa: 36000,
    });
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);

    await cancelSale(sale._id, "Bhul kore kora hoyeche");

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("marks the sale cancelled without deleting it", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 12000,
    });

    await cancelSale(sale._id, "Buyer ferot diyeche");

    const stored = await SaleModel.findById(sale._id);
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("cancelled");
    expect(stored!.cancelReason).toBe("Buyer ferot diyeche");
    expect(stored!.cancelledAt).toBeInstanceOf(Date);
  });

  it("keeps the invoice number rather than freeing it", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1 }],
      discountPercent: 0,
      paidPaisa: 12000,
    });

    await cancelSale(sale._id, "test");

    const stored = await SaleModel.findById(sale._id);
    expect(stored!.invoiceNo).toBe(sale.invoiceNo);
  });

  it("returns retail stock too", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 4 }],
    });
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(496);

    await cancelSale(sale._id, "test");

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("returns stock for every line", async () => {
    const a = await makeMedicine({}, 500);
    const b = await makeMedicine({ name: "Ace" }, 300);
    const sale = await recordRetailSale({
      items: [
        { medicineId: a._id, patas: 2 },
        { medicineId: b._id, patas: 3 },
      ],
    });

    await cancelSale(sale._id, "test");

    expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(500);
    expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(300);
  });

  it("refuses to cancel twice, so stock is not returned twice", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 4 }],
    });

    await cancelSale(sale._id, "first");
    await expect(cancelSale(sale._id, "second")).rejects.toThrow(
      "Ei bikri age theke cancel kora",
    );

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("returns the snapshotted patas even if the pack size later changed", async () => {
    const medicine = await makeMedicine({}, 500);
    const buyer = await makeBuyer();
    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2 }],
      discountPercent: 0,
      paidPaisa: 24000,
    });
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(480);

    // The supplier switches pack size after the sale.
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $set: { patasPerBox: 12 } },
    );

    await cancelSale(sale._id, "test");

    // 20 patas went out, so exactly 20 must come back — not 24.
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("throws for an unknown sale", async () => {
    await expect(
      cancelSale("507f1f77bcf86cd799439011", "test"),
    ).rejects.toThrow("Bikri pawa jay ni");
  });

  it("throws for a malformed id", async () => {
    await expect(cancelSale("not-an-id", "test")).rejects.toThrow(
      "Bikri pawa jay ni",
    );
  });

  it("requires a reason", async () => {
    const medicine = await makeMedicine();
    const sale = await recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
    });
    await expect(cancelSale(sale._id, "   ")).rejects.toThrow(
      "Cancel korar karon likhte hobe",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      cancelSale("507f1f77bcf86cd799439011", "test"),
    ).rejects.toThrow();
  });
});

describe("sale lines snapshot the medicine form", () => {
  it("records the form on a retail line", async () => {
    const syrup = await makeMedicine({
      name: "Napa Syrup",
      form: "syrup",
      patasPerBox: 12,
    });

    const sale = await recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 3 }],
    });

    expect(sale.items[0].form).toBe("syrup");
    // The tier marker is untouched: it says which tier was sold, not what
    // that tier is called.
    expect(sale.items[0].unit).toBe("pata");
  });

  it("records the form on a wholesale line", async () => {
    const syrup = await makeMedicine({
      name: "Ace Syrup",
      form: "syrup",
      patasPerBox: 12,
    });
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: syrup._id, boxes: 2 }],
      discountPercent: 0,
      paidPaisa: 0,
    });

    expect(sale.items[0].form).toBe("syrup");
    expect(sale.items[0].unit).toBe("box");
  });

  it("keeps the old form on a past sale after the medicine changes form", async () => {
    const syrup = await makeMedicine({
      name: "Napa Syrup Plus",
      form: "syrup",
      patasPerBox: 12,
    });
    const sale = await recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 1 }],
    });

    await MedicineModel.updateOne(
      { _id: syrup._id },
      { $set: { form: "tablet" } },
    );

    const reread = await SaleModel.findById(sale._id).lean();
    expect(reread?.items[0].form).toBe("syrup");
  });
});

describe("zero-quantity wholesale lines", () => {
  it("keeps a zeroed line on the sale and bills only the rest", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3 },
        { medicineId: outOfStock._id, boxes: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    });

    expect(sale.items).toHaveLength(2);
    const zeroed = sale.items.find((i) => i.medicineName === "Ace Syrup");
    expect(zeroed?.quantity).toBe(0);
    expect(zeroed?.patasDeducted).toBe(0);
    expect(zeroed?.lineTotalPaisa).toBe(0);
    expect(sale.subtotalPaisa).toBe(36000);
  });

  it("takes no stock for a zeroed line", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 7);
    const buyer = await makeBuyer();

    await recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3 },
        { medicineId: outOfStock._id, boxes: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    });

    const after = await MedicineModel.findById(outOfStock._id);
    expect(after?.stockPatas).toBe(7);
  });

  it("returns only the stock that actually left when the sale is cancelled", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 7);
    const buyer = await makeBuyer();

    const sale = await recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3 },
        { medicineId: outOfStock._id, boxes: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    });

    await cancelSale(sale._id, "Buyer ferot diyeche");

    // 500 back to 500, and the zero line must not invent 7 more.
    expect((await MedicineModel.findById(supplied._id))?.stockPatas).toBe(500);
    expect((await MedicineModel.findById(outOfStock._id))?.stockPatas).toBe(7);
  });

  it("still rejects a negative quantity", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    await expect(
      recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: -1 }],
        discountPercent: 0,
        paidPaisa: 0,
      }),
    ).rejects.toThrow("Poriman 0 er kom hote parbe na");
  });

  it("still rejects a zero quantity at the retail counter", async () => {
    const medicine = await makeMedicine();

    await expect(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 0 }] }),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });
});
