"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { OrderModel, type OrderDoc } from "@/models/Order";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel } from "@/models/Medicine";

export type ApprovalItemInput = { medicineId: string; boxes: number };

export async function listPendingOrders(): Promise<Serialized<OrderDoc>[]> {
  await requireAdminAction();
  await connectDb();

  // Oldest first: the owner works the queue front to back.
  const orders = await OrderModel.find({ status: "pending" })
    .sort({ createdAt: 1 })
    .lean<OrderDoc[]>();
  return toPlainList(orders);
}

/**
 * The current box price of each given medicine, keyed by medicine id.
 *
 * An order snapshots the price the buyer saw, but approval bills at the
 * medicine's *current* price (see approveOrder → writeWholesaleSale). The
 * pending-orders screen shows this map so its preview total matches the
 * invoice the owner is about to create — a snapshot-priced preview would
 * quietly disagree with the sale whenever a price changed since the order.
 * A medicine that no longer exists or is deactivated is simply absent; the
 * caller falls back to the order's snapshot for display.
 */
export async function currentBoxPrices(
  medicineIds: string[],
): Promise<Record<string, number>> {
  await requireAdminAction();
  await connectDb();

  if (!Array.isArray(medicineIds)) return {};
  const validIds = medicineIds.filter((id) =>
    mongoose.Types.ObjectId.isValid(id),
  );
  if (validIds.length === 0) return {};

  const medicines = await MedicineModel.find({
    _id: { $in: validIds },
    active: true,
  })
    .select("boxPricePaisa")
    .lean<{ _id: mongoose.Types.ObjectId; boxPricePaisa: number }[]>();

  return Object.fromEntries(
    medicines.map((m) => [m._id.toString(), m.boxPricePaisa]),
  );
}

export async function getOrderForAdmin(
  orderId: string,
): Promise<Serialized<OrderDoc> | null> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) return null;
  const order = await OrderModel.findById(orderId).lean<OrderDoc>();
  return order ? toPlain(order) : null;
}

function validateApproval(items: ApprovalItemInput[]): void {
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
      throw new Error("Ekta medicine ekbar er beshi dewa jabe na");
    }
    seen.add(item.medicineId);
  }
}

/**
 * Approves a pending order into a wholesale sale. The owner may reduce
 * quantities or drop lines (a buyer ordered 10 boxes; only 6 are in stock —
 * approve 6), but may not introduce a medicine the buyer never ordered.
 *
 * Stock deduction, invoice numbering, and the sale itself go through the same
 * writeWholesaleSale used by the wholesale form, so an order-sourced sale is
 * identical to a form-sourced one. The order's status flip is in the same
 * transaction, guarded in the filter so an order can't be approved twice.
 */
export async function approveOrder(
  orderId: string,
  items: ApprovalItemInput[],
): Promise<Serialized<SaleDoc>> {
  const adminSession = await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }

  const session = await mongoose.startSession();
  let saleId: mongoose.Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const order = await OrderModel.findById(orderId).session(session);
      if (!order) throw new Error("Order pawa jay ni");
      if (order.status !== "pending") {
        throw new Error("Ei order ar approve kora jabe na");
      }

      // Item shape/emptiness is checked only once we know which order we're
      // approving, so an unknown order reports "not found" rather than
      // "cart empty" when both are true of the call.
      validateApproval(items);

      // Every approved line must have been in the order — the owner adjusts
      // quantities, he does not add products the buyer never asked for.
      const ordered = new Set(order.items.map((line) => String(line.medicineId)));
      for (const item of items) {
        if (!ordered.has(item.medicineId)) {
          throw new Error("Order er baire er medicine dewa jabe na");
        }
      }

      const sale = await writeWholesaleSale({
        session,
        buyer: {
          id: order.buyerId,
          name: order.buyerName,
          shopName: order.buyerShopName,
        },
        items,
        discountPaisa: 0,
        // The buyer pays nothing at order time; it is all due, collected
        // later through the Baki Khata.
        paidPaisa: 0,
        createdBy: adminSession.userId,
        orderId: String(order._id),
      });

      // Guard the transition in the filter so a concurrent approval can't
      // also pass and create a second sale.
      const flipped = await OrderModel.updateOne(
        { _id: order._id, status: "pending" },
        {
          $set: {
            status: "approved",
            saleId: sale._id,
            resolvedAt: new Date(),
          },
        },
        { session },
      );
      if (flipped.matchedCount === 0) {
        throw new Error("Ei order ar approve kora jabe na");
      }

      saleId = sale._id;
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/orders");
  revalidatePath("/medicines");
  revalidatePath("/due");

  const sale = await SaleModel.findById(saleId).lean<SaleDoc>();
  return toPlain(sale!);
}

export async function rejectOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Order pawa jay ni");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("Reject korar karon likhte hobe");
  }

  const result = await OrderModel.updateOne(
    { _id: orderId, status: "pending" },
    { $set: { status: "rejected", rejectReason: reason.trim(), resolvedAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    // Either the order doesn't exist or it isn't pending any more.
    const exists = await OrderModel.exists({ _id: orderId });
    throw new Error(exists ? "Ei order ar reject kora jabe na" : "Order pawa jay ni");
  }

  revalidatePath("/orders");
}
