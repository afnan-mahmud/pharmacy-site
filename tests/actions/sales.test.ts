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
  searchRetailCustomers,
  updateSale,
} from "@/actions/sales";
import { createBuyer } from "@/actions/buyers";
import { listBuyerDues, listRetailDues, recordRetailPayment } from "@/actions/due";
import { computeBuyerDue } from "@/lib/dueComputation";
import { computeRetailDue } from "@/lib/retailDueComputation";
import { MedicineModel } from "@/models/Medicine";
import { SaleModel } from "@/models/Sale";
import { SettingsModel } from "@/models/Settings";
import { PaymentModel } from "@/models/Payment";
import { RetailPaymentModel } from "@/models/RetailPayment";

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
  purchasePricePaisa: 9000,
  wholesaleBoxPricePaisa: 12000,
  wholesalePataPricePaisa: 1300,
  retailBoxPricePaisa: 13000,
  retailPataPricePaisa: 1400,
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

const percent = (p: number) => ({ kind: "percent" as const, percent: p });
const amount = (a: number) => ({ kind: "amount" as const, amountPaisa: a });

// Every action here is admin-only work, so every test needs a valid admin
// session unless it is specifically testing the guard.
beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("recordRetailSale", () => {
  it("charges the khuchra rate and deducts stock", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 26000,
    }));

    expect(sale.type).toBe("retail");
    expect(sale.totalPaisa).toBe(26000);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(480);
  });

  it("assigns an invoice number", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.invoiceNo).toMatch(/^NP-\d{6}$/);
  });

  it("has no buyer", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerId).toBeNull();
  });

  it("applies a percent discount", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(10),
      paidPaisa: 11700,
    }));
    expect(sale.discountPaisa).toBe(1300);
    expect(sale.totalPaisa).toBe(11700);
    expect(sale.duePaisa).toBe(0);
  });

  it("applies a flat amount discount", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: amount(500),
      paidPaisa: 12500,
    }));
    expect(sale.discountPaisa).toBe(500);
    expect(sale.totalPaisa).toBe(12500);
  });

  it("records a partial payment as a due when a phone is given", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim",
      customerPhone: "01711111111",
      discount: percent(0),
      paidPaisa: 5000,
    }));
    expect(sale.duePaisa).toBe(8000);
  });

  it("rejects a due with no phone", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 5000,
      })),
    ).rejects.toThrow("Baki rakhte hole phone number dite hobe");
  });

  it("allows a custom item", async () => {
    const sale = await unwrap(recordRetailSale({
      items: [{ customName: "Syringe", customPricePaisa: 2000, boxes: 2, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 4000,
    }));
    expect(sale.items[0].medicineId).toBeNull();
    expect(sale.totalPaisa).toBe(4000);
  });

  it("allows a zero-quantity line alongside a billable one", async () => {
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const sale = await unwrap(recordRetailSale({
      items: [
        { medicineId: supplied._id, boxes: 1, patas: 0 },
        { medicineId: outOfStock._id, boxes: 0, patas: 0 },
      ],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.items).toHaveLength(2);
    expect(sale.totalPaisa).toBe(13000);
  });

  it("rejects a sale whose only line is zero", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 0, patas: 0 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("rejects an empty cart", async () => {
    await expect(
      unwrap(recordRetailSale({ items: [], customerName: "Walk-in", discount: percent(0), paidPaisa: 0 })),
    ).rejects.toThrow("Cart khali");
  });

  it("rejects a missing or blank name", async () => {
    const medicine = await makeMedicine();
    for (const customerName of ["", "   ", undefined as never]) {
      await expect(
        unwrap(recordRetailSale({
          items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
          customerName,
          discount: percent(0),
          paidPaisa: 13000,
        })),
      ).rejects.toThrow("Customer nam likhte hobe");
    }
  });

  it("rejects the same medicine listed twice", async () => {
    const medicine = await makeMedicine({}, 3);
    await expect(
      unwrap(recordRetailSale({
        items: [
          { medicineId: medicine._id, boxes: 0, patas: 2 },
          { medicineId: medicine._id, boxes: 0, patas: 1 },
        ],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Ekoi medicine dui bar add kora jabe na");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: "507f1f77bcf86cd799439011", boxes: 0, patas: 1 }],
        customerName: "Walk-in",
        discount: percent(0),
        paidPaisa: 0,
      })),
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

    expect(first.invoiceNo).toBe("NP-000001");
    expect(second.invoiceNo).toBe("NP-000002");
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

  it("allows paying more than the total, recording a credit", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 99999,
    }));
    expect(sale.totalPaisa).toBe(12000);
    expect(sale.duePaisa).toBe(12000 - 99999);
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
      items: [{ medicineId: medicine._id, boxes: 0, patas: 4 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 5600,
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
        { medicineId: a._id, boxes: 0, patas: 2 },
        { medicineId: b._id, boxes: 0, patas: 3 },
      ],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 2800 + 4200,
    }));

    await unwrap(cancelSale(sale._id, "test"));

    expect((await MedicineModel.findById(a._id))!.stockPatas).toBe(500);
    expect((await MedicineModel.findById(b._id))!.stockPatas).toBe(300);
  });

  it("refuses to cancel twice, so stock is not returned twice", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 0, patas: 4 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 5600,
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
      items: [{ medicineId: medicine._id, boxes: 0, patas: 1 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 1400,
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

/**
 * Cancelling returns the goods. The money the customer already handed over is
 * theirs either way, so it has to survive the sale as credit — before this,
 * `paidPaisa` lived on the sale document and left the books along with it,
 * and a fully-paid sale that was cancelled read as "Baki nei" while the
 * pharmacy was still holding the cash.
 */
describe("cancelSale returns the money paid, not only the stock", () => {
  it("leaves a fully-paid wholesale buyer holding the whole amount as credit", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));
    expect(await computeBuyerDue(buyer._id)).toBe(0);

    await unwrap(cancelSale(sale._id, "Buyer shob ferot diyeche"));

    // Negative means the pharmacy owes the buyer — see src/lib/dueDisplay.ts.
    expect(await computeBuyerDue(buyer._id)).toBe(-12000);
  });

  it("credits only what was actually paid on a part-paid sale", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 5000,
    }));
    // Owes the unpaid 7000 of a 12000 sale.
    expect(await computeBuyerDue(buyer._id)).toBe(7000);

    await unwrap(cancelSale(sale._id, "ferot"));

    // The unpaid 7000 leaves with the sale; the 5000 he handed over does not.
    expect(await computeBuyerDue(buyer._id)).toBe(-5000);
  });

  it("records the credit as a payment naming the cancelled invoice", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

    await unwrap(cancelSale(sale._id, "ferot"));

    const payments = await PaymentModel.find({ buyerId: buyer._id }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountPaisa).toBe(12000);
    // The owner has to be able to explain the credit to the buyer.
    expect(payments[0]!.note).toContain(sale.invoiceNo!);
  });

  it("writes nothing when the sale was never paid for", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));
    expect(await computeBuyerDue(buyer._id)).toBe(12000);

    await unwrap(cancelSale(sale._id, "ferot"));

    expect(await PaymentModel.countDocuments({ buyerId: buyer._id })).toBe(0);
    expect(await computeBuyerDue(buyer._id)).toBe(0);
  });

  it("keeps the buyer visible on the due list, holding the credit", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

    await unwrap(cancelSale(sale._id, "ferot"));

    // A buyer with no active sale left must not vanish along with it — the
    // credit is only reachable from their row.
    const rows = await listBuyerDues();
    const row = rows.find((r) => r.buyerId === buyer._id);
    expect(row).toBeDefined();
    expect(row!.duePaisa).toBe(-12000);
  });

  it("credits a retail customer against their phone number", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Rahim",
      customerPhone: "01712345678",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(await computeRetailDue("01712345678")).toBe(0);

    await unwrap(cancelSale(sale._id, "ferot"));

    expect(await computeRetailDue("01712345678")).toBe(-13000);
    const payments = await RetailPaymentModel.find({
      phone: "01712345678",
    }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountPaisa).toBe(13000);
  });

  it("records no credit for an anonymous counter sale, and still returns stock", async () => {
    const medicine = await makeMedicine({}, 500);
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));

    // No phone means no customer record and no ledger to credit — the refund
    // is cash across the counter. Such a sale cannot carry a due either, so
    // no balance is left wrong by having nowhere to put this.
    await unwrap(cancelSale(sale._id, "ferot"));

    expect(await RetailPaymentModel.countDocuments({})).toBe(0);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("does not credit twice when a cancel is attempted twice", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));

    await unwrap(cancelSale(sale._id, "first"));
    await expect(unwrap(cancelSale(sale._id, "second"))).rejects.toThrow(
      "Ei bikri age theke cancel kora",
    );

    expect(await PaymentModel.countDocuments({ buyerId: buyer._id })).toBe(1);
    expect(await computeBuyerDue(buyer._id)).toBe(-12000);
  });

  it("leaves an unrelated buyer-level payment untouched", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    // Two sales; he settles one of them at the counter later.
    const kept = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));
    const cancelled = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 12000,
    }));
    expect(kept.duePaisa).toBe(12000);

    await unwrap(cancelSale(cancelled._id, "ferot"));

    // Still owes 12000 on the kept sale, against 12000 of credit from the
    // cancelled one: square, not zero-by-accident.
    expect(await computeBuyerDue(buyer._id)).toBe(0);
    expect(await PaymentModel.countDocuments({ buyerId: buyer._id })).toBe(1);
  });
});

/**
 * An edit re-derives duePaisa from a new paid amount, so it can turn a
 * fully-paid counter sale — legitimately created with no phone — into one
 * carrying a due. listRetailDues groups by buyerPhone and excludes the empty
 * string, so such a due is invisible the moment it is written: owed, and
 * unreachable by any screen or payment.
 */
describe("updateSale keeps a retail due collectable", () => {
  async function anonymousPaidSale() {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerPhone).toBe("");
    expect(sale.duePaisa).toBe(0);
    return { medicine, sale };
  }

  it("refuses an edit that would leave a due with no phone", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    await expect(
      unwrap(updateSale({
        saleId: sale._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow("Baki rakhte hole phone number dite hobe");
  });

  it("leaves the sale untouched when that edit is refused", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    await expect(
      unwrap(updateSale({
        saleId: sale._id,
        items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
        discount: percent(0),
        paidPaisa: 0,
      })),
    ).rejects.toThrow();

    // The whole edit runs in one transaction, so a refusal must not leave
    // the stock returned or the lines rewritten.
    const stored = await SaleModel.findById(sale._id);
    expect(stored!.paidPaisa).toBe(13000);
    expect(stored!.duePaisa).toBe(0);
    expect(stored!.items).toHaveLength(1);
    expect(stored!.items[0]!.quantity).toBe(1);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(490);
  });

  it("accepts the same edit once a phone is supplied", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    const edited = await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
      customerPhone: "01712345678",
    }));

    expect(edited.duePaisa).toBe(13000);
    expect(edited.buyerPhone).toBe("01712345678");
  });

  it("puts that due on the khuchra baki list where the owner can see it", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
      customerPhone: "01712345678",
    }));

    expect(await computeRetailDue("01712345678")).toBe(13000);
    const rows = await listRetailDues();
    expect(rows.find((r) => r.phone === "01712345678")?.duePaisa).toBe(13000);
  });

  it("registers the customer so the due can actually be paid off", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
      customerPhone: "01712345678",
    }));

    // recordRetailPayment refuses a phone with no RetailCustomer behind it,
    // so a due introduced by an edit would otherwise be uncollectable.
    await unwrap(recordRetailPayment("01712345678", 130, "purota"));
    expect(await computeRetailDue("01712345678")).toBe(0);
  });

  it("still allows an edit that leaves no due on an anonymous sale", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    const edited = await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(10),
      paidPaisa: 11700,
    }));

    expect(edited.duePaisa).toBe(0);
    expect(edited.buyerPhone).toBe("");
  });

  it("keeps the existing phone when the edit does not mention one", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Rahim",
      customerPhone: "01787654321",
      discount: percent(0),
      paidPaisa: 0,
    }));

    const edited = await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 2, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
    }));

    expect(edited.buyerPhone).toBe("01787654321");
    expect(await computeRetailDue("01787654321")).toBe(26000);
  });

  it("moves the due when a mistyped phone is corrected", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Rahim",
      customerPhone: "01711111111",
      discount: percent(0),
      paidPaisa: 0,
    }));
    expect(await computeRetailDue("01711111111")).toBe(13000);

    await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
      customerPhone: "01722222222",
    }));

    expect(await computeRetailDue("01711111111")).toBe(0);
    expect(await computeRetailDue("01722222222")).toBe(13000);
  });

  it("ignores customerPhone on a wholesale sale, whose phone is the buyer's", async () => {
    const medicine = await makeMedicine();
    const buyer = await makeBuyer();
    const sale = await unwrap(recordWholesaleSale({
      buyerId: buyer._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discountPercent: 0,
      paidPaisa: 0,
    }));

    const edited = await unwrap(updateSale({
      saleId: sale._id,
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      discount: percent(0),
      paidPaisa: 0,
      customerPhone: "01799999999",
    }));

    expect(edited.buyerPhone).toBe(buyer.phone);
    // A wholesale due is keyed by buyerId, so it is unaffected either way.
    expect(await computeBuyerDue(buyer._id)).toBe(12000);
  });

  it("rejects a non-string phone", async () => {
    const { medicine, sale } = await anonymousPaidSale();

    await expect(
      unwrap(updateSale({
        saleId: sale._id,
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        discount: percent(0),
        paidPaisa: 0,
        customerPhone: 1712345678 as unknown as string,
      })),
    ).rejects.toThrow("customerPhone must be a string");
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
      items: [{ medicineId: syrup._id, boxes: 0, patas: 3 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 4200,
    }));

    expect(sale.items[0].form).toBe("syrup");
    expect(sale.items[0].unit).toBe("box");
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
      items: [{ medicineId: syrup._id, boxes: 0, patas: 1 }],
      customerName: "Walk-in",
      discount: percent(0),
      paidPaisa: 1400,
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
    ).rejects.toThrow("Box er poriman thik nai");
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
    ).rejects.toThrow("Pata er poriman thik nai");
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
    ).rejects.toThrow("Pata er poriman thik nai");
  });
});

describe("retail customer details", () => {
  it("stores the customer name and phone on the sale, trimmed", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "  Karim Uddin  ",
      customerPhone: "  01711111111  ",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerName).toBe("Karim Uddin");
    expect(sale.buyerPhone).toBe("01711111111");
    expect(sale.buyerId).toBeNull();
  });

  it("treats the phone as optional when the sale is fully paid", async () => {
    const medicine = await makeMedicine();
    const sale = await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim Uddin",
      discount: percent(0),
      paidPaisa: 13000,
    }));
    expect(sale.buyerPhone).toBe("");
  });

  it("rejects a phone that is not a string", async () => {
    const medicine = await makeMedicine();
    await expect(
      unwrap(recordRetailSale({
        items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
        customerName: "Karim Uddin",
        customerPhone: 1711111111 as never,
        discount: percent(0),
        paidPaisa: 13000,
      })),
    ).rejects.toThrow("customerPhone must be a string");
  });
});

describe("searchRetailCustomers", () => {
  it("matches by phone prefix, most recently updated first", async () => {
    const medicine = await makeMedicine();
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim", customerPhone: "01711111111",
      discount: percent(0), paidPaisa: 13000,
    }));
    await unwrap(recordRetailSale({
      items: [{ medicineId: medicine._id, boxes: 1, patas: 0 }],
      customerName: "Karim Uddin", customerPhone: "01711111111",
      discount: percent(0), paidPaisa: 13000,
    }));

    const matches = await searchRetailCustomers("0171");
    expect(matches).toEqual([{ name: "Karim Uddin", phone: "01711111111" }]);
  });

  it("returns nothing for a query under 2 characters", async () => {
    expect(await searchRetailCustomers("0")).toEqual([]);
  });

  it("returns nothing for a phone never seen", async () => {
    expect(await searchRetailCustomers("0199")).toEqual([]);
  });

  it("rejects a non-admin caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(searchRetailCustomers("0171")).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});
