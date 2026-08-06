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
import { BUYER_ONLY_ERROR } from "@/lib/session";
import {
  submitOrder,
  submitShortlist,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  myDueBalance,
  myLedger,
  getMySale,
  searchMedicinesForBuyer,
} from "@/actions/buyerOrders";
import { MAX_LINE_ITEMS, TOO_MANY_LINES_ERROR } from "@/lib/lineLimits";
import { recordWholesaleSale } from "@/actions/sales";
import { recordPayment } from "@/actions/due";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";
import { SaleModel } from "@/models/Sale";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

// buyerToken() signs a token for BUYER_USER_ID; the buyer document must have
// that exact _id so ownership lines up.
async function makeSessionBuyer(overrides = {}) {
  return BuyerModel.create({
    _id: new mongoose.Types.ObjectId(BUYER_USER_ID),
    name: "Karim Uddin",
    shopName: "Karim Medical Hall",
    phone: "01711111111",
    address: "Mirpur",
    passwordHash: "x",
    active: true,
    ...overrides,
  });
}

async function makeMedicine(overrides = {}) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  return MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    purchasePricePaisa: 9000,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    retailBoxPricePaisa: 13000,
    retailPataPricePaisa: 1400,
    stockPatas: 500,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await buyerToken());
});

describe("submitOrder", () => {
  it("snapshots the medicine form on each order line", async () => {
    await makeSessionBuyer();
    const syrup = await makeMedicine({
      name: "Ace Syrup",
      form: "syrup",
      patasPerBox: 12,
    });

    const order = await unwrap(submitOrder([
      { medicineId: String(syrup._id), boxes: 2, patas: 0 },
    ]));

    expect(order.items[0].form).toBe("syrup");
  });

  it("defaults an order line to tablet for a medicine saved before forms existed", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    // Strip the field the way a document written before this change looks.
    await MedicineModel.updateOne(
      { _id: medicine._id },
      { $unset: { form: "" } },
    );

    const order = await unwrap(submitOrder([
      { medicineId: String(medicine._id), boxes: 1, patas: 0 },
    ]));

    expect(order.items[0].form).toBe("tablet");
  });

  it("creates a pending order snapshotting both wholesale rates", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    const order = await unwrap(submitOrder([
      { medicineId: String(medicine._id), boxes: 3, patas: 0 },
    ]));

    expect(order.status).toBe("pending");
    expect(order.items[0].medicineName).toBe("Napa 500mg");
    expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
    expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
    expect(order.items[0].boxes).toBe(3);
    expect(order.buyerName).toBe("Karim Uddin");
  });

  it("bills a loose-patas order line from the wholesale pata rate, not the box rate", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    const order = await unwrap(submitOrder([
      { medicineId: String(medicine._id), boxes: 1, patas: 4 },
    ]));

    expect(order.items[0].boxes).toBe(1);
    expect(order.items[0].patas).toBe(4);
    expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
    expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
  });

  it("does not change stock (approval does that, not ordering)", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 3, patas: 0 }]));
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(500);
  });

  it("rejects an empty cart", async () => {
    await makeSessionBuyer();
    await expect(unwrap(submitOrder([]))).rejects.toThrow("Cart khali");
  });

  it("rejects a line where both boxes and patas are zero", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 0, patas: 0 }])),
    ).rejects.toThrow("Ontoto ekta box ba pata order korte hobe");
  });

  it("rejects a fractional box or patas count", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1.5, patas: 0 }])),
    ).rejects.toThrow("Box er poriman thik nai");
    await expect(
      unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 0, patas: 1.5 }])),
    ).rejects.toThrow("Pata er poriman thik nai");
  });

  it("rejects the same medicine twice in one order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      unwrap(submitOrder([
        { medicineId: String(medicine._id), boxes: 1, patas: 0 },
        { medicineId: String(medicine._id), boxes: 2, patas: 0 },
      ])),
    ).rejects.toThrow("ekbar er beshi");
  });

  it("rejects an unknown or malformed medicine", async () => {
    await makeSessionBuyer();
    await expect(
      unwrap(submitOrder([{ medicineId: "not-an-id", boxes: 1, patas: 0 }])),
    ).rejects.toThrow("Medicine pawa jay ni");
    await expect(
      unwrap(submitOrder([{ medicineId: "507f1f77bcf86cd799439011", boxes: 1, patas: 0 }])),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to order a deactivated medicine", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine({ active: false });
    await expect(
      unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }])),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to place an order for an inactive buyer", async () => {
    await makeSessionBuyer({ active: false });
    const medicine = await makeMedicine();
    await expect(
      unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }])),
    ).rejects.toThrow("Apnar account bondho ache");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(unwrap(submitOrder([]))).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(unwrap(submitOrder([]))).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

describe("listMyOrders", () => {
  it("returns only the session buyer's orders, newest first", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }]));
    await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 2, patas: 0 }]));

    // Another buyer's order must not appear.
    const other = new mongoose.Types.ObjectId();
    await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, wholesaleBoxPricePaisa: 12000, wholesalePataPricePaisa: 1300 }],
    });

    const orders = await listMyOrders();
    expect(orders).toHaveLength(2);
    expect(orders[0].items[0].boxes).toBe(2); // newest first
    expect(orders.every((o) => o.buyerName === "Karim Uddin")).toBe(true);
  });
});

describe("getMyOrder — ownership", () => {
  it("returns the buyer's own order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const created = await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }]));
    const fetched = await getMyOrder(created._id);
    expect(fetched!._id).toBe(created._id);
  });

  it("returns null for another buyer's order — never leaks it", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const other = new mongoose.Types.ObjectId();
    const foreign = await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, wholesaleBoxPricePaisa: 12000, wholesalePataPricePaisa: 1300 }],
    });
    expect(await getMyOrder(String(foreign._id))).toBeNull();
  });

  it("returns null for a malformed id", async () => {
    await makeSessionBuyer();
    expect(await getMyOrder("not-an-id")).toBeNull();
  });
});

describe("cancelMyOrder — ownership and status", () => {
  it("cancels the buyer's own pending order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const order = await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }]));
    await unwrap(cancelMyOrder(order._id));
    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("cancelled");
  });

  it("refuses to cancel another buyer's order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const other = new mongoose.Types.ObjectId();
    const foreign = await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, wholesaleBoxPricePaisa: 12000, wholesalePataPricePaisa: 1300 }],
    });
    await expect(unwrap(cancelMyOrder(String(foreign._id)))).rejects.toThrow(
      "Order pawa jay ni",
    );
    // and it stays pending
    expect((await OrderModel.findById(foreign._id))!.status).toBe("pending");
  });

  it("refuses to cancel an order that is no longer pending", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const order = await unwrap(submitOrder([{ medicineId: String(medicine._id), boxes: 1, patas: 0 }]));
    await OrderModel.updateOne({ _id: order._id }, { $set: { status: "approved" } });
    await expect(unwrap(cancelMyOrder(order._id))).rejects.toThrow(
      "Ei order ar cancel kora jabe na",
    );
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(unwrap(cancelMyOrder("507f1f77bcf86cd799439011"))).rejects.toThrow(
      BUYER_ONLY_ERROR,
    );
  });
});

describe("myDueBalance and myLedger — buyer-scoped reads", () => {
  it("returns only the session buyer's own balance and ledger, never another buyer's", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    // Seed a second, unrelated buyer with their own sale — this requires an
    // admin session, so switch briefly before returning to the buyer
    // session below.
    setSessionCookie(cookieStore, await adminToken());
    const otherBuyer = await BuyerModel.create({
      name: "Onno Buyer",
      shopName: "Onno Shop",
      phone: "01799999999",
      address: "Uttara",
      passwordHash: "x",
      active: true,
    });
    await unwrap(recordWholesaleSale({
      buyerId: String(otherBuyer._id),
      items: [{ medicineId: String(medicine._id), boxes: 5, patas: 0 }], // 60000 paisa
      discountPercent: 0,
      paidPaisa: 0,
    }));

    // The session buyer's own sale, partially paid, plus a separate payment.
    await unwrap(recordWholesaleSale({
      buyerId: BUYER_USER_ID,
      items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }], // 12000 paisa
      discountPercent: 0,
      paidPaisa: 2000,
    }));
    await unwrap(recordPayment(BUYER_USER_ID, 10, "test")); // 1000 paisa

    // Back to the buyer session for the reads under test.
    setSessionCookie(cookieStore, await buyerToken());

    expect(await myDueBalance()).toBe(9000); // 12000 - 2000 - 1000

    const ledger = await myLedger();
    expect(ledger.sales).toHaveLength(1);
    expect(ledger.sales.every((s) => s.buyerId === BUYER_USER_ID)).toBe(true);
    expect(ledger.payments).toHaveLength(1);
    // The other buyer's 60000-paisa sale must never appear here.
    expect(ledger.sales.some((s) => s.totalPaisa === 60000)).toBe(false);
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(myDueBalance()).rejects.toThrow(BUYER_ONLY_ERROR);
    await expect(myLedger()).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(myDueBalance()).rejects.toThrow(BUYER_ONLY_ERROR);
    await expect(myLedger()).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

describe("searchMedicinesForBuyer", () => {
  it("returns the buyer-safe fields — availability, never the raw stock or khuchra price", async () => {
    await makeSessionBuyer();
    await makeMedicine({ name: "Napa 500mg", mrpBoxPricePaisa: 15000 });

    const results = await searchMedicinesForBuyer("Napa");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: expect.any(String),
      name: "Napa 500mg",
      company: "Beximco",
      category: "",
      form: "tablet",
      patasPerBox: 10,
      wholesaleBoxPricePaisa: 12000,
      wholesalePataPricePaisa: 1300,
      mrpBoxPricePaisa: 15000,
      // 500 patas, threshold 20 -> comfortably in stock, as a signal only.
      availability: "in",
    });
    // Structural guarantee: the exact stock count and both khuchra (retail)
    // rates never leak onto this object — only the two wholesale rates a
    // wholesale buyer is meant to see, plus the three-way availability.
    const keys = Object.keys(results[0]).sort();
    expect(keys).not.toContain("stockPatas");
    expect(keys).not.toContain("retailBoxPricePaisa");
    expect(keys).not.toContain("retailPataPricePaisa");
    expect(keys).not.toContain("lowStockThreshold");
    expect(keys).toEqual([
      "availability",
      "category",
      "company",
      "form",
      "id",
      "mrpBoxPricePaisa",
      "name",
      "patasPerBox",
      "wholesaleBoxPricePaisa",
      "wholesalePataPricePaisa",
    ]);
  });

  it("reports low availability without revealing the number", async () => {
    await makeSessionBuyer();
    await makeMedicine({ name: "LowMed", stockPatas: 10, lowStockThreshold: 20 });
    await makeMedicine({ name: "OutMed", stockPatas: 0, lowStockThreshold: 20 });

    const low = await searchMedicinesForBuyer("LowMed");
    const out = await searchMedicinesForBuyer("OutMed");
    expect(low[0].availability).toBe("low");
    expect(out[0].availability).toBe("low");
  });

  it("matches by generic name too, and returns active medicines for a blank query", async () => {
    await makeSessionBuyer();
    await makeMedicine({ name: "Napa 500mg", genericName: "Paracetamol" });

    expect(await searchMedicinesForBuyer("Paracetamol")).toHaveLength(1);
    expect(await searchMedicinesForBuyer("   ")).toHaveLength(1);
  });

  it("excludes a deactivated medicine", async () => {
    await makeSessionBuyer();
    await makeMedicine({ name: "Old Med", active: false });
    expect(await searchMedicinesForBuyer("Old Med")).toEqual([]);
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(searchMedicinesForBuyer("napa")).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(searchMedicinesForBuyer("napa")).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

// A Server Action is a directly-callable POST endpoint, so the length of an
// items array is set by the caller, not by the UI. Both order paths walk that
// array one document at a time, and submitShortlist appends to a single
// long-lived document — see src/lib/lineLimits.ts for why an unbounded array
// is an availability problem rather than just a validation one.
describe("order size cap", () => {
  it("rejects a submitOrder payload past the cap", async () => {
    await makeSessionBuyer();

    const items = Array.from({ length: MAX_LINE_ITEMS + 1 }, () => ({
      medicineId: String(new mongoose.Types.ObjectId()),
      boxes: 1,
      patas: 0,
    }));

    await expect(submitOrder(items)).resolves.toMatchObject({
      ok: false,
      error: TOO_MANY_LINES_ERROR,
    });
  });

  it("still accepts an order exactly at the cap", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    // One real line plus the cap's worth minus one is awkward to build with
    // distinct medicines, so check the boundary through the validator's own
    // ordering: a payload *at* the cap gets past the length check and fails
    // later, on a medicine that does not exist — not on the cap.
    const items = Array.from({ length: MAX_LINE_ITEMS }, (_, i) =>
      i === 0
        ? { medicineId: String(medicine._id), boxes: 1, patas: 0 }
        : { medicineId: String(new mongoose.Types.ObjectId()), boxes: 1, patas: 0 },
    );

    const result = await submitOrder(items);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toBe(TOO_MANY_LINES_ERROR);
  });

  it("counts the merged size, not just the incoming request, on submitShortlist", async () => {
    const buyer = await makeSessionBuyer();

    // A pending order already sitting at the cap.
    await OrderModel.create({
      buyerId: buyer._id,
      buyerName: buyer.name,
      buyerShopName: buyer.shopName,
      status: "pending",
      items: Array.from({ length: MAX_LINE_ITEMS }, (_, i) => ({
        medicineId: null,
        medicineName: `Product ${i}`,
        form: "custom",
        boxes: 1,
        patas: 0,
        wholesaleBoxPricePaisa: 0,
        wholesalePataPricePaisa: 0,
      })),
    });

    // One more *new* name would take it past the cap, even though the request
    // itself is a single item.
    await expect(
      submitShortlist([{ name: "Product NEW", boxes: 1, patas: 0 }]),
    ).resolves.toMatchObject({ ok: false, error: TOO_MANY_LINES_ERROR });
  });

  it("still merges into a full order when the name already exists", async () => {
    const buyer = await makeSessionBuyer();

    await OrderModel.create({
      buyerId: buyer._id,
      buyerName: buyer.name,
      buyerShopName: buyer.shopName,
      status: "pending",
      items: Array.from({ length: MAX_LINE_ITEMS }, (_, i) => ({
        medicineId: null,
        medicineName: `Product ${i}`,
        form: "custom",
        boxes: 1,
        patas: 0,
        wholesaleBoxPricePaisa: 0,
        wholesalePataPricePaisa: 0,
      })),
    });

    // Adding to a line that is already there appends nothing, so a full order
    // must not become un-addable — only *growth* past the cap is refused.
    const order = await unwrap(
      submitShortlist([{ name: "Product 0", boxes: 4, patas: 0 }]),
    );

    expect(order.items).toHaveLength(MAX_LINE_ITEMS);
    expect(order.items[0].boxes).toBe(5);
  });

  describe("getMySale", () => {
    it("returns the sale when it belongs to the logged-in buyer", async () => {
      const buyer = await makeSessionBuyer();
      const medicine = await makeMedicine();

      // Record a wholesale sale for this buyer
      setSessionCookie(cookieStore, await adminToken());
      const recorded = await unwrap(
        recordWholesaleSale({
          buyerId: String(buyer._id),
          items: [{ medicineId: String(medicine._id), boxes: 2, patas: 0 }],
          discountPercent: 0,
          paidPaisa: 5000,
        }),
      );

      // Now switch to buyer session and fetch
      setSessionCookie(cookieStore, await buyerToken());
      const sale = await getMySale(recorded._id);

      expect(sale).not.toBeNull();
      expect(sale?._id).toBe(recorded._id);
      expect(sale?.invoiceNo).toBe(recorded.invoiceNo);
      expect(sale?.totalPaisa).toBe(recorded.totalPaisa);
      expect(sale?.items).toHaveLength(1);
      expect(sale?.items[0].medicineName).toBe("Napa 500mg");
    });

    it("returns null when the sale belongs to a different buyer", async () => {
      await makeSessionBuyer();
      const medicine = await makeMedicine();

      const otherBuyer = await BuyerModel.create({
        name: "Other Buyer",
        shopName: "Other Pharmacy",
        phone: "01722222222",
        passwordHash: "x",
        active: true,
      });

      setSessionCookie(cookieStore, await adminToken());
      const otherSale = await unwrap(
        recordWholesaleSale({
          buyerId: String(otherBuyer._id),
          items: [{ medicineId: String(medicine._id), boxes: 1, patas: 0 }],
          discountPercent: 0,
          paidPaisa: 0,
        }),
      );

      // Logged-in buyer should not see other buyer's sale
      setSessionCookie(cookieStore, await buyerToken());
      const result = await getMySale(otherSale._id);
      expect(result).toBeNull();
    });

    it("returns null for non-existent or invalid sale id", async () => {
      await makeSessionBuyer();
      setSessionCookie(cookieStore, await buyerToken());

      expect(await getMySale("invalid-id")).toBeNull();
      expect(await getMySale(new mongoose.Types.ObjectId().toString())).toBeNull();
    });

    it("rejects when not authenticated as buyer", async () => {
      clearSessionCookie(cookieStore);
      await expect(
        getMySale(new mongoose.Types.ObjectId().toString()),
      ).rejects.toThrow(BUYER_ONLY_ERROR);
    });
  });
});
