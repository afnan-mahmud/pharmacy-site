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
  currentWholesalePrices,
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
    purchasePricePaisa: 9000,
    wholesaleBoxPricePaisa: 12000,
    wholesalePataPricePaisa: 1300,
    retailBoxPricePaisa: 13000,
    retailPataPricePaisa: 1400,
    stockPatas,
    lowStockThreshold: 20,
    active: true,
    ...overrides,
  });
  return medicine;
}

async function makeOrder(
  buyerId: mongoose.Types.ObjectId,
  medicine: { _id: mongoose.Types.ObjectId; name: string; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number },
  boxes = 3,
  patas = 0,
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
        patas,
        wholesaleBoxPricePaisa: medicine.wholesaleBoxPricePaisa,
        wholesalePataPricePaisa: medicine.wholesalePataPricePaisa,
      },
    ],
    status: "pending",
  });
}

beforeEach(async () => {
  setSessionCookie(cookieStore, await adminToken());
});

describe("currentWholesalePrices", () => {
  it("returns each medicine's current wholesale box and pata rate, not any snapshot", async () => {
    const a = await makeMedicine();
    const b = await makeMedicine({ name: "Ace", wholesaleBoxPricePaisa: 5000, wholesalePataPricePaisa: 550 });
    // Raise A's rates after it was made — the current rate is what matters.
    await MedicineModel.updateOne(
      { _id: a._id },
      { $set: { wholesaleBoxPricePaisa: 13000, wholesalePataPricePaisa: 1350 } },
    );

    const prices = await currentWholesalePrices([String(a._id), String(b._id)]);
    expect(prices[String(a._id)]).toEqual({ boxPricePaisa: 13000, pataPricePaisa: 1350 });
    expect(prices[String(b._id)]).toEqual({ boxPricePaisa: 5000, pataPricePaisa: 550 });
  });

  it("omits a deactivated or unknown medicine so the caller falls back to the snapshot", async () => {
    const gone = await makeMedicine({ active: false });
    const prices = await currentWholesalePrices([
      String(gone._id),
      "507f1f77bcf86cd799439011",
      "not-an-id",
    ]);
    expect(prices).toEqual({});
  });

  it("rejects a buyer caller", async () => {
    setSessionCookie(cookieStore, await buyerToken());
    await expect(currentWholesalePrices([])).rejects.toThrow(ADMIN_ONLY_ERROR);
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

  it("allows the owner to add a medicine not in the original order", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({ name: "Napa 500mg" }, 500);
    const other = await makeMedicine({ name: "Ace 500mg", wholesaleBoxPricePaisa: 15000 }, 300);
    const order = await makeOrder(buyer._id, medicine, 3);

    const sale = await unwrap(
      approveOrder(String(order._id), [
        { medicineId: String(medicine._id), boxes: 3 },
        { medicineId: String(other._id), boxes: 2 },
      ]),
    );

    expect(sale.items).toHaveLength(2);
    expect(sale.items[0].medicineName).toBe("Napa 500mg");
    expect(sale.items[0].quantity).toBe(3);
    expect(sale.items[1].medicineName).toBe("Ace 500mg");
    expect(sale.items[1].quantity).toBe(2);
    expect(sale.subtotalPaisa).toBe(3 * 12000 + 2 * 15000);
    expect((await MedicineModel.findById(other._id))!.stockPatas).toBe(280);
    expect((await OrderModel.findById(order._id))!.status).toBe("approved");
  });

  it("allows the owner to approve an order with both added medicines and custom items", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({ name: "Napa 500mg" }, 500);
    const other = await makeMedicine({ name: "Ace 500mg", wholesaleBoxPricePaisa: 15000 }, 300);
    const order = await makeOrder(buyer._id, medicine, 2);

    const sale = await unwrap(
      approveOrder(String(order._id), [
        { medicineId: String(medicine._id), boxes: 2 },
        { medicineId: String(other._id), boxes: 1 },
        { customName: "Surgical Gloves", customPricePaisa: 45000, boxes: 3 },
      ]),
    );

    expect(sale.items).toHaveLength(3);
    expect(sale.items[0].medicineName).toBe("Napa 500mg");
    expect(sale.items[1].medicineName).toBe("Ace 500mg");
    expect(sale.items[2].medicineName).toBe("Surgical Gloves");
    expect(sale.items[2].medicineId).toBeNull();
    expect(sale.items[2].quantity).toBe(3);
    expect(sale.items[2].ratePaisa).toBe(45000);
    expect(sale.items[2].lineTotalPaisa).toBe(3 * 45000);
    expect(sale.subtotalPaisa).toBe(2 * 12000 + 1 * 15000 + 3 * 45000);
    expect((await OrderModel.findById(order._id))!.status).toBe("approved");
  });

  it("approves even when stock is short, leaving stock negative and the order approved", async () => {
    const buyer = await makeBuyer();
    const medicine = await makeMedicine({}, 25); // 2 boxes + 5 patas
    const order = await makeOrder(buyer._id, medicine, 3);

    const sale = await unwrap(
      approveOrder(String(order._id), [{ medicineId: String(medicine._id), boxes: 3 }]),
    );
    expect(sale.items[0].quantity).toBe(3);
    expect((await MedicineModel.findById(medicine._id))!.stockPatas).toBe(-5);
    expect((await OrderModel.findById(order._id))!.status).toBe("approved");
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
    supplied: { _id: mongoose.Types.ObjectId; name: string; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number },
    outOfStock: { _id: mongoose.Types.ObjectId; name: string; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number },
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
          wholesaleBoxPricePaisa: supplied.wholesaleBoxPricePaisa,
          wholesalePataPricePaisa: supplied.wholesalePataPricePaisa,
        },
        {
          medicineId: outOfStock._id,
          medicineName: outOfStock.name,
          boxes: 10,
          wholesaleBoxPricePaisa: outOfStock.wholesaleBoxPricePaisa,
          wholesalePataPricePaisa: outOfStock.wholesalePataPricePaisa,
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
