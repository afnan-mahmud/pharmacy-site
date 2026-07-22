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
} from "../helpers/auth";
import { ADMIN_ONLY_ERROR } from "@/lib/session";
import {
  listPendingOrders,
  getOrderForAdmin,
  approveOrder,
  rejectOrder,
  currentBoxPrices,
} from "@/actions/adminOrders";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";
import { SaleModel } from "@/models/Sale";

const cookieStore = createMockCookieStore();
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}));

setupTestDb();

async function makeBuyer(overrides = {}) {
  return BuyerModel.create({
    name: "Karim Uddin",
    shopName: "Karim Medical Hall",
    phone: `017${Math.floor(Math.random() * 100000000)}`,
    address: "Mirpur",
    passwordHash: "x",
    active: true,
    ...overrides,
  });
}

async function makeMedicine(overrides = {}, stockPatas = 500) {
  const name = (overrides as { name?: string }).name ?? "Napa 500mg";
  const medicine = await MedicineModel.create({
    name,
    nameLower: name.toLowerCase(),
    genericName: "Paracetamol",
    company: "Beximco",
    patasPerBox: 10,
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
  return medicine;
}

async function makeOrder(
  buyerId: mongoose.Types.ObjectId,
  medicine: { _id: mongoose.Types.ObjectId; name: string; boxPricePaisa: number },
  boxes = 3,
) {
  return OrderModel.create({
    buyerId,
    buyerName: "Karim Uddin",
    buyerShopName: "Karim Medical Hall",
    items: [
      {
        medicineId: medicine._id,
        medicineName: medicine.name,
        boxes,
        boxPricePaisa: medicine.boxPricePaisa,
      },
    ],
    status: "pending",
  });
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("currentBoxPrices", () => {
  it("returns each medicine's current box price, not any snapshot", async () => {
    const a = await makeMedicine();
    const b = await makeMedicine({ name: "Ace", boxPricePaisa: 5000 });
    // Raise A's price after it was made — the current price is what matters.
    await MedicineModel.updateOne({ _id: a._id }, { $set: { boxPricePaisa: 13000 } });

    const prices = await currentBoxPrices([String(a._id), String(b._id)]);
    expect(prices[String(a._id)]).toBe(13000);
    expect(prices[String(b._id)]).toBe(5000);
  });

  it("omits a deactivated or unknown medicine so the caller falls back to the snapshot", async () => {
    const gone = await makeMedicine({ active: false });
    const prices = await currentBoxPrices([
      String(gone._id),
      "507f1f77bcf86cd799439011",
      "not-an-id",
    ]);
    expect(prices).toEqual({});
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(currentBoxPrices([])).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("listPendingOrders", () => {
  it("returns pending orders oldest first, excluding resolved ones", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const first = await makeOrder(buyer._id, medicine);
    const second = await makeOrder(buyer._id, medicine);
    await OrderModel.updateOne({ _id: second._id }, { $set: { status: "approved" } });

    const pending = await listPendingOrders();
    expect(pending).toHaveLength(1);
    expect(pending[0]._id).toBe(String(first._id));
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(listPendingOrders()).rejects.toThrow(ADMIN_ONLY_ERROR);
  });
});

describe("approveOrder", () => {
  it("turns a pending order into a fully-unpaid wholesale sale and links them", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);

    const sale = await unwrap(approveOrder(String(order._id), [
      { medicineId: String(medicine._id), boxes: 3 },
    ]));

    expect(sale.type).toBe("wholesale");
    expect(sale.totalPaisa).toBe(36000);
    expect(sale.paidPaisa).toBe(0);
    expect(sale.duePaisa).toBe(36000);
    expect(String(sale.orderId)).toBe(String(order._id));

    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("approved");
    expect(String(after!.saleId)).toBe(sale._id);
    expect(after!.resolvedAt).toBeInstanceOf(Date);

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(470);
  });

  it("lets the owner approve fewer boxes than were ordered", async () => {
    // Buyer ordered 10, only 6 in stock: approve 6.
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({}, 60); // 6 boxes
    const order = await makeOrder(buyer._id, medicine, 10);

    const sale = await unwrap(approveOrder(String(order._id), [
      { medicineId: String(medicine._id), boxes: 6 },
    ]));
    expect(sale.items[0].quantity).toBe(6);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(0);
    // The order preserves what the buyer originally asked for.
    expect((await OrderModel.findById(order._id))!.items[0].boxes).toBe(10);
  });

  it("refuses an item not in the order", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const other = await makeMedicine({ name: "Ace" });
    const order = await makeOrder(buyer._id, medicine, 3);

    await expect(
      unwrap(approveOrder(String(order._id), [{ medicineId: String(other._id), boxes: 1 }])),
    ).rejects.toThrow("Order er baire er medicine");
  });

  it("aborts when stock is short and leaves the order pending, stock intact, no invoice consumed", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    const order = await makeOrder(buyer._id, medicine, 3);

    await expect(
      unwrap(approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 3 }])),
    ).rejects.toThrow("stock e ache");

    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(25);
    expect((await OrderModel.findById(order._id))!.status).toBe("pending");
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("cannot approve an order twice", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 1);

    await unwrap(approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }]));
    await expect(
      unwrap(approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }])),
    ).rejects.toThrow("Ei order ar approve kora jabe na");

    // Stock only dropped once.
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(490);
    expect(await SaleModel.countDocuments()).toBe(1);
  });

  it("rejects an empty approval", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);
    await expect(unwrap(approveOrder(String(order._id), []))).rejects.toThrow("Cart khali");
  });

  it("rejects an unknown order", async () => {
    await expect(
      unwrap(approveOrder("507f1f77bcf86cd799439011", [])),
    ).rejects.toThrow("Order pawa jay ni");
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(approveOrder("507f1f77bcf86cd799439011", []))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

describe("rejectOrder", () => {
  it("marks a pending order rejected with a reason and creates no sale", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);

    await unwrap(rejectOrder(String(order._id), "Stock nai"));
    const after = await OrderModel.findById(order._id);
    expect(after!.status).toBe("rejected");
    expect(after!.rejectReason).toBe("Stock nai");
    expect(after!.resolvedAt).toBeInstanceOf(Date);
    expect(await SaleModel.countDocuments()).toBe(0);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(500);
  });

  it("requires a reason", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 3);
    await expect(unwrap(rejectOrder(String(order._id), "  "))).rejects.toThrow(
      "Reject korar karon likhte hobe",
    );
  });

  it("cannot reject an already-approved order", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine, 1);
    await unwrap(approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 1 }]));
    await expect(unwrap(rejectOrder(String(order._id), "too late"))).rejects.toThrow(
      "Ei order ar reject kora jabe na",
    );
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(unwrap(rejectOrder("507f1f77bcf86cd799439011", "x"))).rejects.toThrow(
      ADMIN_ONLY_ERROR,
    );
  });
});

describe("zero-quantity approval lines", () => {
  /** An order for two medicines, so one can be zeroed and one supplied. */
  async function makeTwoItemOrder(
    buyerId: mongoose.Types.ObjectId,
    supplied: { _id: mongoose.Types.ObjectId; name: string; boxPricePaisa: number },
    outOfStock: { _id: mongoose.Types.ObjectId; name: string; boxPricePaisa: number },
  ) {
    return OrderModel.create({
      buyerId,
      buyerName: "Karim Uddin",
      buyerShopName: "Karim Medical Hall",
      items: [
        {
          medicineId: supplied._id,
          medicineName: supplied.name,
          boxes: 3,
          boxPricePaisa: supplied.boxPricePaisa,
        },
        {
          medicineId: outOfStock._id,
          medicineName: outOfStock.name,
          boxes: 10,
          boxPricePaisa: outOfStock.boxPricePaisa,
        },
      ],
      status: "pending",
    });
  }

  it("keeps a zeroed line on the sale instead of dropping it", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    const sale = await unwrap(approveOrder(String(order._id), [
      { medicineId: String(supplied._id), boxes: 3 },
      { medicineId: String(outOfStock._id), boxes: 0 },
    ]));

    // The whole point: the buyer's paper still shows what was asked for.
    expect(sale.items).toHaveLength(2);
    const zeroed = sale.items.find((i) => i.medicineName === "Ace Syrup");
    expect(zeroed?.quantity).toBe(0);
    expect(zeroed?.patasDeducted).toBe(0);
    expect(zeroed?.lineTotalPaisa).toBe(0);
  });

  it("bills only the supplied line", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    const sale = await unwrap(approveOrder(String(order._id), [
      { medicineId: String(supplied._id), boxes: 3 },
      { medicineId: String(outOfStock._id), boxes: 0 },
    ]));

    expect(sale.subtotalPaisa).toBe(36000);
    expect(sale.totalPaisa).toBe(36000);
  });

  it("takes no stock for a zeroed line", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 7);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    await unwrap(approveOrder(String(order._id), [
      { medicineId: String(supplied._id), boxes: 3 },
      { medicineId: String(outOfStock._id), boxes: 0 },
    ]));

    const after = await MedicineModel.findById(outOfStock._id);
    expect(after?.stockPatas).toBe(7);
    const billed = await MedicineModel.findById(supplied._id);
    expect(billed?.stockPatas).toBe(470);
  });

  it("approves a zeroed line even when that medicine has no stock at all", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    // Would throw "stock e ache 0" if a zero line still went through the
    // stock deduction.
    await expect(
      unwrap(approveOrder(String(order._id), [
        { medicineId: String(supplied._id), boxes: 3 },
        { medicineId: String(outOfStock._id), boxes: 0 },
      ])),
    ).resolves.toBeTruthy();
  });

  it("refuses an approval where every line is zero", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    await expect(
      unwrap(approveOrder(String(order._id), [
        { medicineId: String(supplied._id), boxes: 0 },
        { medicineId: String(outOfStock._id), boxes: 0 },
      ])),
    ).rejects.toThrow("Onto ekta line e poriman dite hobe");
  });

  it("leaves the order pending when an all-zero approval is refused", async () => {
    const buyer = await makeBuyer();
    const supplied = await makeMedicine({ name: "Napa 500mg" });
    const outOfStock = await makeMedicine({ name: "Ace Syrup" }, 0);
    const order = await makeTwoItemOrder(buyer._id, supplied, outOfStock);

    await expect(
      unwrap(approveOrder(String(order._id), [
        { medicineId: String(supplied._id), boxes: 0 },
        { medicineId: String(outOfStock._id), boxes: 0 },
      ])),
    ).rejects.toThrow();

    const reread = await OrderModel.findById(order._id);
    expect(reread?.status).toBe("pending");
    expect(await SaleModel.countDocuments()).toBe(0);
  });

  it("still rejects a negative quantity", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine();
    const order = await makeOrder(buyer._id, medicine);

    await expect(
      unwrap(approveOrder(String(order._id), [
        { medicineId: String(medicine._id), boxes: -1 },
      ])),
    ).rejects.toThrow("Poriman 0 er kom hote parbe na");
  });
});
