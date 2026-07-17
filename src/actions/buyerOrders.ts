"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireBuyerAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel, type OrderDoc } from "@/models/Order";

export type OrderItemInput = { medicineId: string; boxes: number };

/**
 * Network-reachable trust boundary — same convention as
 * src/actions/medicines.ts. Validates shape before any database work.
 */
function validateItems(items: OrderItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart khali");
  }
  const seen = new Set<string>();
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 1
    ) {
      throw new Error("Box sonkha 1 er kom hote parbe na");
    }
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi order kora jabe na");
    }
    seen.add(item.medicineId);
  }
}

export async function submitOrder(
  items: OrderItemInput[],
): Promise<Serialized<OrderDoc>> {
  const session = await requireBuyerAction();
  await connectDb();
  validateItems(items);

  const buyer = await BuyerModel.findById(session.userId);
  // The session could outlive the account being deactivated; re-check.
  if (!buyer || !buyer.active) {
    throw new Error("Apnar account bondho ache");
  }

  const lines = [];
  for (const item of items) {
    const medicine = await MedicineModel.findById(item.medicineId);
    if (!medicine || !medicine.active) throw new Error("Medicine pawa jay ni");
    lines.push({
      medicineId: medicine._id,
      medicineName: medicine.name,
      boxes: item.boxes,
      // Snapshot the box price the buyer is ordering at.
      boxPricePaisa: medicine.boxPricePaisa,
    });
  }

  const order = await OrderModel.create({
    buyerId: buyer._id,
    buyerName: buyer.name,
    buyerShopName: buyer.shopName,
    items: lines,
    status: "pending",
  });

  revalidatePath("/buyer/orders");
  return toPlain(order.toObject());
}

export async function listMyOrders(): Promise<Serialized<OrderDoc>[]> {
  const session = await requireBuyerAction();
  await connectDb();

  const orders = await OrderModel.find({ buyerId: session.userId })
    .sort({ createdAt: -1 })
    .lean<OrderDoc[]>();
  return toPlainList(orders);
}

export async function getMyOrder(
  orderId: string,
): Promise<Serialized<OrderDoc> | null> {
  const session = await requireBuyerAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;

  // Ownership is in the filter: an order that isn't this buyer's simply
  // isn't found, so there is no path that returns another buyer's order.
  const order = await OrderModel.findOne({
    _id: orderId,
    buyerId: session.userId,
  }).lean<OrderDoc>();
  return order ? toPlain(order) : null;
}

export async function cancelMyOrder(orderId: string): Promise<void> {
  const session = await requireBuyerAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }

  // Confirm ownership first, with a message that does not reveal whether the
  // order exists under a different buyer.
  const order = await OrderModel.findOne({
    _id: orderId,
    buyerId: session.userId,
  });
  if (!order) throw new Error("Order pawa jay ni");

  // Only a pending order is cancelable; guard the transition in the filter so
  // a race can't cancel an order the owner is mid-approving.
  const result = await OrderModel.updateOne(
    { _id: orderId, buyerId: session.userId, status: "pending" },
    { $set: { status: "cancelled", resolvedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    throw new Error("Ei order ar cancel kora jabe na");
  }

  revalidatePath("/buyer/orders");
}
