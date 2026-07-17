import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
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
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
} from "@/actions/buyerOrders";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel } from "@/models/Order";

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
    boxPricePaisa: 12000,
    pataPricePaisa: 1400,
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
  it("creates a pending order snapshotting the box price", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();

    const order = await submitOrder([
      { medicineId: String(medicine._id), boxes: 3 },
    ]);

    expect(order.status).toBe("pending");
    expect(order.items[0].medicineName).toBe("Napa 500mg");
    expect(order.items[0].boxPricePaisa).toBe(12000);
    expect(order.items[0].boxes).toBe(3);
    expect(order.buyerName).toBe("Karim Uddin");
  });

  it("does not change stock (approval does that, not ordering)", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await submitOrder([{ medicineId: String(medicine._id), boxes: 3 }]);
    const after = await MedicineModel.findById(medicine._id);
    expect(after!.stockPatas).toBe(500);
  });

  it("rejects an empty cart", async () => {
    await makeSessionBuyer();
    await expect(submitOrder([])).rejects.toThrow("Cart khali");
  });

  it("rejects a zero or fractional box count", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 0 }]),
    ).rejects.toThrow("Box sonkha 1 er kom hote parbe na");
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1.5 }]),
    ).rejects.toThrow("Box sonkha 1 er kom hote parbe na");
  });

  it("rejects the same medicine twice in one order", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await expect(
      submitOrder([
        { medicineId: String(medicine._id), boxes: 1 },
        { medicineId: String(medicine._id), boxes: 2 },
      ]),
    ).rejects.toThrow("ekbar er beshi");
  });

  it("rejects an unknown or malformed medicine", async () => {
    await makeSessionBuyer();
    await expect(
      submitOrder([{ medicineId: "not-an-id", boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
    await expect(
      submitOrder([{ medicineId: "507f1f77bcf86cd799439011", boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to order a deactivated medicine", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine({ active: false });
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]),
    ).rejects.toThrow("Medicine pawa jay ni");
  });

  it("refuses to place an order for an inactive buyer", async () => {
    await makeSessionBuyer({ active: false });
    const medicine = await makeMedicine();
    await expect(
      submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]),
    ).rejects.toThrow("Apnar account bondho ache");
  });

  it("rejects an unauthenticated caller", async () => {
    clearSessionCookie(cookieStore);
    await expect(submitOrder([])).rejects.toThrow(BUYER_ONLY_ERROR);
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(submitOrder([])).rejects.toThrow(BUYER_ONLY_ERROR);
  });
});

describe("listMyOrders", () => {
  it("returns only the session buyer's orders, newest first", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await submitOrder([{ medicineId: String(medicine._id), boxes: 2 }]);

    // Another buyer's order must not appear.
    const other = new mongoose.Types.ObjectId();
    await OrderModel.create({
      buyerId: other,
      buyerName: "Onno keu",
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
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
    const created = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
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
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
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
    const order = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await cancelMyOrder(order._id);
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
      items: [{ medicineId: medicine._id, medicineName: "Napa", boxes: 5, boxPricePaisa: 12000 }],
    });
    await expect(cancelMyOrder(String(foreign._id))).rejects.toThrow(
      "Order pawa jay ni",
    );
    // and it stays pending
    expect((await OrderModel.findById(foreign._id))!.status).toBe("pending");
  });

  it("refuses to cancel an order that is no longer pending", async () => {
    await makeSessionBuyer();
    const medicine = await makeMedicine();
    const order = await submitOrder([{ medicineId: String(medicine._id), boxes: 1 }]);
    await OrderModel.updateOne({ _id: order._id }, { $set: { status: "approved" } });
    await expect(cancelMyOrder(order._id)).rejects.toThrow(
      "Ei order ar cancel kora jabe na",
    );
  });

  it("rejects an admin caller", async () => {
    setSessionCookie(cookieStore, await adminToken());
    await expect(cancelMyOrder("507f1f77bcf86cd799439011")).rejects.toThrow(
      BUYER_ONLY_ERROR,
    );
  });
});
