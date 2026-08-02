import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { setupTestDb } from "../helpers/db";
import { OrderModel } from "@/models/Order";

setupTestDb();

const BUYER_ID = new mongoose.Types.ObjectId();
const MEDICINE_ID = new mongoose.Types.ObjectId();

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    buyerId: BUYER_ID,
    buyerName: "Karim Uddin",
    buyerShopName: "Karim Medical Hall",
    items: [
      {
        medicineId: MEDICINE_ID,
        medicineName: "Napa 500mg",
        boxes: 3,
        patas: 0,
        wholesaleBoxPricePaisa: 12000,
        wholesalePataPricePaisa: 1300,
      },
    ],
    ...overrides,
  };
}

describe("Order model", () => {
  it("defaults a new order to pending with no sale or reject reason", async () => {
    const order = await OrderModel.create(baseOrder());
    expect(order.status).toBe("pending");
    expect(order.saleId).toBeNull();
    expect(order.rejectReason).toBe("");
    expect(order.resolvedAt).toBeNull();
  });

  it("snapshots the line's medicine name and both wholesale rates", async () => {
    const order = await OrderModel.create(baseOrder());
    expect(order.items[0].medicineName).toBe("Napa 500mg");
    expect(order.items[0].wholesaleBoxPricePaisa).toBe(12000);
    expect(order.items[0].wholesalePataPricePaisa).toBe(1300);
    expect(order.items[0].boxes).toBe(3);
  });

  it("requires at least one item", async () => {
    await expect(OrderModel.create(baseOrder({ items: [] }))).rejects.toThrow();
  });

  it("rejects a negative box count", async () => {
    await expect(
      OrderModel.create(
        baseOrder({
          items: [
            {
              medicineId: MEDICINE_ID,
              medicineName: "Napa",
              boxes: -1,
              wholesaleBoxPricePaisa: 12000,
              wholesalePataPricePaisa: 1300,
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("accepts each valid status", async () => {
    for (const status of ["pending", "approved", "rejected", "cancelled"] as const) {
      const order = await OrderModel.create(baseOrder({ status }));
      expect(order.status).toBe(status);
    }
  });

  it("rejects an unknown status", async () => {
    await expect(
      OrderModel.create(baseOrder({ status: "shipped" })),
    ).rejects.toThrow();
  });
});
