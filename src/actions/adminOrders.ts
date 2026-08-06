"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { writeWholesaleSale } from "@/lib/writeWholesaleSale";
import { type DiscountInput } from "@/lib/saleTotals";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { OrderModel, type OrderDoc } from "@/models/Order";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { MedicineModel } from "@/models/Medicine";
import { BuyerModel } from "@/models/Buyer";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import { assertLineCount } from "@/lib/lineLimits";

export type ApprovalItemInput = {
  medicineId?: string;
  customName?: string;
  customPricePaisa?: number;
  /** Per-box buying cost of a custom line — see SaleItemInput in src/lib/saleLines.ts. */
  customCostPaisa?: number;
  boxes: number;
  patas?: number;
};

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
 * The current wholesale box and pata rate of each given medicine, keyed by
 * medicine id.
 *
 * An order snapshots the rates the buyer saw, but approval bills at the
 * medicine's *current* rates (see approveOrder → writeWholesaleSale). The
 * order-edit screen (OrderEditor.tsx) shows this map so its preview total
 * matches the invoice the owner is about to create — a snapshot-priced
 * preview would quietly disagree with the sale whenever a rate changed
 * since the order. The one-click pending-orders list (PendingOrders.tsx)
 * does not call this: it still previews from the order's own snapshot,
 * which can be stale relative to the current rate.
 * A medicine that no longer exists or is deactivated is simply absent; the
 * caller falls back to the order's own snapshot for display.
 */
export async function currentWholesalePrices(
  medicineIds: string[],
): Promise<Record<string, { boxPricePaisa: number; pataPricePaisa: number }>> {
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
    .select("wholesaleBoxPricePaisa wholesalePataPricePaisa")
    .lean<{ _id: mongoose.Types.ObjectId; wholesaleBoxPricePaisa: number; wholesalePataPricePaisa: number }[]>();

  return Object.fromEntries(
    medicines.map((m) => [
      m._id.toString(),
      { boxPricePaisa: m.wholesaleBoxPricePaisa, pataPricePaisa: m.wholesalePataPricePaisa },
    ]),
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
  assertLineCount(items.length);
  const seen = new Set<string>();
  let customCounter = 0;
  for (const item of items) {
    let idStr = item.medicineId;
    if (idStr) {
      if (!mongoose.Types.ObjectId.isValid(idStr)) {
        throw new Error("Medicine pawa jay ni");
      }
    } else {
      if (!item.customName || item.customPricePaisa === undefined) {
        throw new Error("Custom item er nam o dam dite hobe");
      }
      // Optional — an approval that records no costing still bills the same,
      // it just reports as all profit the way it always did.
      if (
        item.customCostPaisa !== undefined &&
        (typeof item.customCostPaisa !== "number" || item.customCostPaisa < 0)
      ) {
        throw new Error("Custom item er costing thik nai");
      }
      idStr = `custom_${customCounter++}`;
    }

    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 0
    ) {
      // 0 is legal here — the owner zeroes a line he cannot supply and it
      // still prints. writeWholesaleSale rejects an all-zero approval.
      throw new Error("Poriman 0 er kom hote parbe na");
    }
    
    if (item.patas !== undefined) {
      if (typeof item.patas !== "number" || !Number.isInteger(item.patas) || item.patas < 0) {
        throw new Error("Poriman 0 er kom hote parbe na");
      }
    }

    if (seen.has(idStr)) {
      throw new Error("Ekta medicine ekbar er beshi dewa jabe na");
    }
    seen.add(idStr);
  }
}

/**
 * Approves a pending order into a wholesale sale. The owner may adjust
 * quantities, drop lines, add custom items, or add additional medicines from
 * the inventory.
 *
 * Stock deduction, invoice numbering, and the sale itself go through the same
 * writeWholesaleSale used by the wholesale form, so an order-sourced sale is
 * identical to a form-sourced one. The order's status flip is in the same
 * transaction, guarded in the filter so an order can't be approved twice.
 */
export async function approveOrder(
  orderId: string,
  items: ApprovalItemInput[],
  discount: DiscountInput | number = 0,
  paidPaisa: number = 0,
): Promise<ActionResult<Serialized<SaleDoc>>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new Error("Order pawa jay ni");
    }

    const discountInput: DiscountInput =
      typeof discount === "number"
        ? { kind: "percent", percent: discount }
        : discount;

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


        // The order denormalises the buyer's name and shop but not the phone,
        // so it is read here rather than left blank — a wholesale sale created
        // from an order should carry the same details as one created from the
        // form. A buyer deleted between ordering and approval leaves the phone
        // empty rather than failing the approval, since the order's own
        // snapshot is what the sale is really built from.
        const buyerDoc = await BuyerModel.findById(order.buyerId).session(
          session,
        );

        const sale = await writeWholesaleSale({
          session,
          buyer: {
            id: order.buyerId,
            name: order.buyerName,
            shopName: order.buyerShopName,
            phone: buyerDoc?.phone ?? "",
          },
          items: items.map(i => ({ ...i, patas: i.patas ?? 0 })),
          discount: discountInput,
          paidPaisa,
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
  });
}

export async function rejectOrder(
  orderId: string,
  reason: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
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
      {
        $set: {
          status: "rejected",
          rejectReason: reason.trim(),
          resolvedAt: new Date(),
        },
      },
    );
    if (result.matchedCount === 0) {
      // Either the order doesn't exist or it isn't pending any more.
      const exists = await OrderModel.exists({ _id: orderId });
      throw new Error(
        exists ? "Ei order ar reject kora jabe na" : "Order pawa jay ni",
      );
    }

    revalidatePath("/orders");
  });
}
