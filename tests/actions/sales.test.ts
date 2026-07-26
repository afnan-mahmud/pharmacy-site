import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupTestDb } from "../helpers/db";
import { unwrap } from "../helpers/action";
import {
  createMockCookieStore,
  setSessionCookie,
  clearSessionCookie,
  adminToken,
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import { createMedicine } from "@/actions/medicines";
import {
  recordRetailSale,
  recordWholesaleSale,
  cancelSale,
  lookupRetailCustomer,
} from "@/actions/sales";
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
  const medicine = await unwrap(createMedicine({ ...napa, ...overrides }));
  await MedicineModel.updateOne({ _id: medicine._id }, { $set: { stockPatas } });
  return medicine;
}

async function makeBuyer(overrides = {}) {
  return unwrap(createBuyer(
    {
      name: "Karim Uddin",
      shopName: "Karim Medical Hall",
      phone: `017${Math.floor(Math.random() * 100000000)}`,
      address: "Mirpur",
      ...overrides,
    },
    "secret123",
  ));
}

// Every action here is admin-only work, so every test needs a valid admin
// session unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("recordRetailSale", () => {
  it("charges the pata rate and deducts patas", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
      customerName: "Walk-in",
    }));

    expect(sale.type).toBe("retail");
    expect(sale.totalPaisa).toBe(2800);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(498);
  });

  it("is always paid in full with no due", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
      customerName: "Walk-in",
    }));
    expect(sale.paidPaisa).toBe(2800);
    expect(sale.duePaisa).toBe(0);
  });

  it("assigns no invoice number", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Walk-in",
    }));
    expect(sale.invoiceNo).toBeNull();
  });

  it("allows a second retail sale without colliding on invoiceNo (regression: a sparse unique index does not skip explicit nulls)", async () => {
    const medicine = await makeMedicine({}, 100);
    const first = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Walk-in",
    }));
    const second = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Walk-in",
    }));
    expect(first.invoiceNo).toBeNull();
    expect(second.invoiceNo).toBeNull();
    expect(await SaleModel.countDocuments({ type: "retail" })).toBe(2);
  });

  it("has no buyer", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Walk-in",
    }));
    expect(sale.buyerId).toBeNull();
  });

  it("snapshots the medicine name and rate onto the line", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
      customerName: "Walk-in",
    }));
    expect(sale.items[0].medicineName).toBe("Napa 500mg");
    expect(sale.items[0].ratePaisa).toBe(1400);
    expect(sale.items[0].unit).toBe("pata");
    expect(sale.items[0].patasDeducted).toBe(2);
  });

  it("does not rewrite a past sale when the price later changes", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
      customerName: "Walk-in",
    }));
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
    const sale = await unwrap(recordRetailSale({
      items: [
        { medicineId: a._id, patas: 2 },
        { medicineId: b._id, patas: 3 },
      ],
      customerName: "Walk-in",
    }));
    expect(sale.totalPaisa).toBe(2800 + 3000);
    expect(sale.items).toHaveLength(2);
  });

  it("succeeds and leaves stock negative when the sale exceeds what is on hand", async () => {
    const medicine = await makeMedicine({}, 5);
    const sale = await unwrap(
      recordRetailSale({ items: [{ medicineId: medicine._id, patas: 6 }], customerName: "Walk-in" }),
    );
    expect(sale.totalPaisa).toBeGreaterThan(0);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(-1);
  });

  it("deducts every line in the same transaction, even when more than one goes negative", async () => {
    const a = await makeMedicine({}, 500);
    const b = await makeMedicine({ name: "Ace" }, 1);

    await unwrap(recordRetailSale({
      items: [
        { medicineId: a._id, patas: 2 },
        { medicineId: b._id, patas: 5 },
      ],
      customerName: "Walk-in",
    }));

    expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(498);
    expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(-4);
  });

  it("rejects an empty sale", async () => {
    await expect(unwrap(recordRetailSale({ items: [], customerName: "Walk-in" }))).rejects.toThrow(
      "Cart khali",
    );
  });

  it("rejects a zero quantity", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({ items: [{ medicineId: medicine._id, patas: 0 }], customerName: "Walk-in" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects a fractional quantity", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({ items: [{ medicineId: medicine._id, patas: 1.5 }], customerName: "Walk-in" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });

  it("rejects a malformed medicine id", async () => {
    await expect(
      unwrap(recordRetailSale({ items: [{ medicineId: "not-an-id", patas: 1 }], customerName: "Walk-in" })),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("rejects an unknown medicine", async () => {
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: "507f1f77bcf86cd799439011", patas: 1 }],
        customerName: "Walk-in",
      })),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("rejects the same medicine listed twice", async () => {
    // Two lines for one medicine would each check stock independently and
    // could together oversell it.
    const medicine = await makeMedicine({}, 3);
    await expect(
      unwrap(recordRetailSale({
        items: [
          { medicineId: medicine._id, patas: 2 },
          { medicineId: medicine._id, patas: 2 },
        ],
        customerName: "Walk-in",
      })),
    ).rejects.toThrow("ekbar er beshi");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(recordRetailSale({ items: [{ medicineId: "507f1f77bcf86cd799439011", patas: 1 }], customerName: "Walk-in" })),
    ).rejects.toThrow();
  });
});

describe("recordWholesaleSale", () => {
  it("charges the box rate and deducts boxes worth of patas", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 36000,
    }));

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
    const line = { medicineId: medicine._id, boxes: 1, patas: 0 };

    const first = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [line],
      discountPercent: 0,
      paidPaisa: 12000,
    }));
    const second = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [line],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

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

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));
    expect(sale.invoiceNo).toBe("RP-000001");
  });

  it("records a part payment as a due", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 20000,
    }));

    expect(sale.totalPaisa).toBe(36000);
    expect(sale.paidPaisa).toBe(20000);
    expect(sale.duePaisa).toBe(16000);
  });

  it("takes a percentage off the total and stores both figures", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 10,
      paidPaisa: 0,
    }));

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

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 2.5,
      paidPaisa: 0,
    }));

    expect(sale.discountPercent).toBe(2.5);
    expect(sale.discountPaisa).toBe(900);
    expect(sale.totalPaisa).toBe(35100);
  });

  it("defaults an old-style sale to no percentage", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    expect(sale.discountPercent).toBe(0);
    expect(sale.discountPaisa).toBe(0);
  });

  it("snapshots the buyer name and shop onto the sale", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));
    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerShopName).toBe("Karim Medical Hall");
  });

  it("succeeds and leaves stock negative when the wholesale sale exceeds what is on hand", async () => {
    const medicine = await makeMedicine({}, 25); // 2 boxes and 5 patas
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    expect(sale.totalPaisa).toBe(36000);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(-5);
  });

  it("burns the invoice number rather than reusing it after a failure", async () => {
    const good = await makeMedicine({}, 500);
    const buyer = await makeBuyer();

    // A sale can no longer fail on stock, so a vanished medicine (never
    // existed) is what stands in for "the sale failed" here.
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: "507f1f77bcf86cd799439011", boxes: 1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Medicine pawa jay ni");

    const after = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: good._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

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
      unwrap(recordWholesaleSale({
        buyerId: "507f1f77bcf86cd799439011",
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Buyer pawa jay ni");
  });

  it("rejects an inactive buyer", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const { setBuyerActive } = await import("@/actions/buyers");
    await unwrap(setBuyerActive(buyer._id, false));

    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Buyer ta bondho ache");
  });

  it("rejects a discount above a hundred percent", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discountPercent: 101,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Discount 0 theke 100 er moddhe hote hobe");
  });

  it("rejects a negative discount percentage", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discountPercent: -1,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Discount 0 theke 100 er moddhe hote hobe");
  });

  it("allows a hundred percent discount, leaving nothing to pay", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 100,
      paidPaisa: 0,
    }));
    expect(sale.totalPaisa).toBe(0);
    expect(sale.duePaisa).toBe(0);
  });

  it("rejects paying more than the total", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 99999,
      })),
    ).rejects.toThrow("Joma taka total er cheye beshi hote parbe na");
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: 0, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: "507f1f77bcf86cd799439011",
        items: [{ medicineId: "507f1f77bcf86cd799439011", boxes: 1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow();
  });
});

describe("cancelSale", () => {
  it("returns the stock the sale took", async () => {
    const medicine = await makeMedicine({}, 500);
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 3, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 36000,
    }));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);

    await unwrap(cancelSale(sale._id, "Bhul kore kora hoyeche"));

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("marks the sale cancelled without deleting it", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

    await unwrap(cancelSale(sale._id, "Buyer ferot diyeche"));

    const stored = await SaleModel.findById(sale._id);
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("cancelled");
    expect(stored!.cancelReason).toBe("Buyer ferot diyeche");
    expect(stored!.cancelledAt).toBeInstanceOf(Date);
  });

  it("keeps the invoice number rather than freeing it", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

    await unwrap(cancelSale(sale._id, "test"));

    const stored = await SaleModel.findById(sale._id);
    expect(stored!.invoiceNo).toBe(sale.invoiceNo);
  });

  it("returns retail stock too", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 4 }],
      customerName: "Walk-in",
    }));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(496);

    await unwrap(cancelSale(sale._id, "test"));

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("returns stock for every line", async () => {
    const a = await makeMedicine({}, 500);
    const b = await makeMedicine({ name: "Ace" }, 300);
    const sale = await unwrap(recordRetailSale({
      items: [
        { medicineId: a._id, patas: 2 },
        { medicineId: b._id, patas: 3 },
      ],
      customerName: "Walk-in",
    }));

    await unwrap(cancelSale(sale._id, "test"));

    expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(500);
    expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(300);
  });

  it("refuses to cancel twice, so stock is not returned twice", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 4 }],
      customerName: "Walk-in",
    }));

    await unwrap(cancelSale(sale._id, "first"));
    await expect(unwrap(cancelSale(sale._id, "second"))).rejects.toThrow(
      "Ei bikri age theke cancel kora",
    );

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("returns the snapshotted patas even if the pack size later changed", async () => {
    const medicine = await makeMedicine({}, 500);
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 24000,
    }));
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(480);

    // The supplier switches pack size after the sale.
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $set: { patasPerBox: 12 } },
    );

    await unwrap(cancelSale(sale._id, "test"));

    // 20 patas went out, so exactly 20 must come back — not 24.
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("throws for an unknown sale", async () => {
    await expect(
      unwrap(cancelSale("507f1f77bcf86cd799439011", "test")),
    ).rejects.toThrow("Bikri pawa jay ni");
  });

  it("throws for a malformed id", async () => {
    await expect(unwrap(cancelSale("not-an-id", "test"))).rejects.toThrow(
      "Bikri pawa jay ni",
    );
  });

  it("requires a reason", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Walk-in",
    }));
    await expect(unwrap(cancelSale(sale._id, "   "))).rejects.toThrow(
      "Cancel korar karon likhte hobe",
    );
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(cancelSale("507f1f77bcf86cd799439011", "test")),
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

    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 3 }],
      customerName: "Walk-in",
    }));

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

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: syrup._id, boxes: 2, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    expect(sale.items[0].form).toBe("syrup");
    expect(sale.items[0].unit).toBe("box");
  });

  it("keeps the old form on a past sale after the medicine changes form", async () => {
    const syrup = await makeMedicine({
      name: "Napa Syrup Plus",
      form: "syrup",
      patasPerBox: 12,
    });
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: syrup._id, patas: 1 }],
      customerName: "Walk-in",
    }));

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

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3, patas: 0 },
        { medicineId: outOfStock._id, boxes: 0, patas: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    }));

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

    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3, patas: 0 },
        { medicineId: outOfStock._id, boxes: 0, patas: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    const after = await MedicineModel.findById(outOfStock._id);
    expect(after?.stockPatas).toBe(7);
  });

  it("returns only the stock that actually left when the sale is cancelled", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 7);
    const buyer = await makeBuyer();

    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [
        { medicineId: supplied._id, boxes: 3, patas: 0 },
        { medicineId: outOfStock._id, boxes: 0, patas: 0 },
      ],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    await unwrap(cancelSale(sale._id, "Buyer ferot diyeche"));

    // 500 back to 500, and the zero line must not invent 7 more.
    expect((await MedicineModel.findById(supplied._id))?.stockPatas).toBe(500);
    expect((await MedicineModel.findById(outOfStock._id))?.stockPatas).toBe(7);
  });

  it("still rejects a negative quantity", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();

    await expect(
      unwrap(recordWholesaleSale({
        buyerId: buyer._id,
        items: [{ medicineId: medicine._id, boxes: -1, patas: 0 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Poriman 0 er kom hote parbe na");
  });

  it("rejects a negative patas quantity", async () => {
    const medicine = await makeMedicine();
    const buyerDoc = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: String(buyerDoc._id),
        items: [{ medicineId: String(medicine._id), boxes: 1, patas: -1 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Poriman 0 er kom hote parbe na");
  });

  it("rejects a fractional patas quantity", async () => {
    const medicine = await makeMedicine();
    const buyerDoc = await makeBuyer();
    await expect(
      unwrap(recordWholesaleSale({
        buyerId: String(buyerDoc._id),
        items: [{ medicineId: String(medicine._id), boxes: 1, patas: 1.5 }],
        discountPercent: 0,
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Poriman 0 er kom hote parbe na");
  });

  it("still rejects a zero quantity at the retail counter", async () => {
    const medicine = await makeMedicine();

    await expect(
      unwrap(recordRetailSale({ items: [{ medicineId: medicine._id, patas: 0 }], customerName: "Walk-in" })),
    ).rejects.toThrow("Poriman 1 er kom hote parbe na");
  });
});

describe("retail customer details", () => {
  it("stores the customer name and phone on the sale", async () => {
    const medicine = await makeMedicine();

    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 2 }],
      customerName: "Karim Uddin",
      customerPhone: "01711111111",
    }));

    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerPhone).toBe("01711111111");
    // A walk-in is still not a tracked entity.
    expect(sale.buyerId).toBeNull();
  });

  it("trims both", async () => {
    const medicine = await makeMedicine();

    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "  Karim Uddin  ",
      customerPhone: "  01711111111  ",
    }));

    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerPhone).toBe("01711111111");
  });

  it("treats the phone as optional", async () => {
    const medicine = await makeMedicine();

    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Karim Uddin",
    }));

    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerPhone).toBe("");
  });

  it("rejects a missing or blank name", async () => {
    const medicine = await makeMedicine();

    for (const customerName of ["", "   ", undefined as never]) {
      await expect(
        unwrap(recordRetailSale({
          items: [{ medicineId: medicine._id, patas: 1 }],
          customerName,
        })),
      ).rejects.toThrow("Customer nam likhte hobe");
    }
  });

  it("rejects a phone that is not a string", async () => {
    const medicine = await makeMedicine();

    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, patas: 1 }],
        customerName: "Karim Uddin",
        customerPhone: 1711111111 as never,
      })),
    ).rejects.toThrow("customerPhone must be a string");
  });

  it("leaves the money and the stock alone", async () => {
    const medicine = await makeMedicine();

    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 5 }],
      customerName: "Karim Uddin",
      customerPhone: "01711111111",
    }));

    expect(sale.totalPaisa).toBe(7000);
    expect(sale.duePaisa).toBe(0);
    const after = await MedicineModel.findById(medicine._id);
    expect(after?.stockPatas).toBe(495);
  });
});

describe("lookupRetailCustomer", () => {
  it("returns the name last used for that phone", async () => {
    const medicine = await makeMedicine();
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Karim",
      customerPhone: "01711111111",
    }));
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Karim Uddin",
      customerPhone: "01711111111",
    }));

    // The most recent wins, so a correction sticks for next time.
    expect(await lookupRetailCustomer("01711111111")).toEqual({
      name: "Karim Uddin",
    });
  });

  it("returns null for a phone never seen", async () => {
    expect(await lookupRetailCustomer("01999999999")).toBeNull();
  });

  it("returns null for a blank phone without matching the many sales that have none", async () => {
    const medicine = await makeMedicine();
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, patas: 1 }],
      customerName: "Nameless Walk-in",
    }));

    expect(await lookupRetailCustomer("")).toBeNull();
    expect(await lookupRetailCustomer("   ")).toBeNull();
  });

  it("ignores wholesale sales on the same phone", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer({ phone: "01733333333" });
    await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    // The wholesale sale carries that phone, but a shop's name must not
    // autofill the walk-in counter.
    expect(await lookupRetailCustomer("01733333333")).toBeNull();
  });

  it("rejects a non-admin caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(lookupRetailCustomer("01711111111")).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});
