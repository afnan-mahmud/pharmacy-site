"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireBuyerAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { computeBuyerDue, loadBuyerLedger } from "@/lib/dueComputation";
import { stockStatus, type StockStatus } from "@/lib/stockStatus";
import { BuyerModel } from "@/models/Buyer";
import { MedicineModel } from "@/models/Medicine";
import { OrderModel, type OrderDoc } from "@/models/Order";
import { type PaymentDoc } from "@/models/Payment";
import { type SaleDoc } from "@/models/Sale";
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
import { actionResult, type ActionResult } from "@/lib/actionResult";

export type OrderItemInput = { medicineId: string; boxes: number };

/**
 * Escapes regex metacharacters so a typed "." or "*" is matched literally.
 * Mirrors the private helper of the same name in src/actions/medicines.ts —
 * duplicated rather than imported/exported across the admin/buyer trust
 * boundary, so this file's guard (requireBuyerAction) stays the only gate a
 * reader has to check for everything exported here.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type BuyerMedicineOption = {
  id: string;
  name: string;
  company: string;
  // Which unit words to show. Not sensitive: it is neither the stock count
  // nor the retail price.
  form: MedicineForm;
  boxPricePaisa: number;
  // The struck-through list price, or 0 for none. Never the internal cost.
  mrpBoxPricePaisa: number;
  // A three-way availability signal, never the exact stock count.
  availability: StockStatus;
};

/**
 * A buyer never sees stock or the pata/retail price (see the domain rule in
 * the buyer portal plan). src/actions/medicines.ts's searchMedicines is
 * both wrong and unsafe for this screen: it is guarded by
 * requireAdminAction (a buyer session gets rejected outright), and even if
 * it weren't, it returns the full Medicine document — stockPatas and
 * pataPricePaisa included — over the wire to the client, where a buyer
 * could read them straight out of the network response regardless of what
 * the UI chooses to render. This is a separate, buyer-guarded read that
 * projects only the two fields a buyer is allowed to see.
 */
export async function searchMedicinesForBuyer(
  query: string,
): Promise<BuyerMedicineOption[]> {
  await requireBuyerAction();
  await connectDb();
  if (typeof query !== "string") {
    throw new Error("query must be a string");
  }
  const term = query.trim();
  if (!term) return [];

  const pattern = { $regex: escapeRegex(term), $options: "i" };
  // stockPatas and lowStockThreshold are read only to derive the three-way
  // availability signal below — they are never returned to the client. The
  // exact count stays on the server; the buyer sees "in / low / out" only.
  const docs = await MedicineModel.find({
    active: true,
    $or: [{ name: pattern }, { genericName: pattern }],
  })
    .select(
      "name company form boxPricePaisa mrpBoxPricePaisa stockPatas lowStockThreshold",
    )
    .sort({ name: 1 })
    .limit(20)
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name: string;
        company: string;
        form?: string;
        boxPricePaisa: number;
        mrpBoxPricePaisa: number;
        stockPatas: number;
        lowStockThreshold: number;
      }[]
    >();

  return docs.map((m) => ({
    id: String(m._id),
    name: m.name,
    company: m.company,
    form: toMedicineForm(m.form),
    boxPricePaisa: m.boxPricePaisa,
    mrpBoxPricePaisa: m.mrpBoxPricePaisa ?? 0,
    availability: stockStatus(m.stockPatas, m.lowStockThreshold),
  }));
}

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
      throw new Error("Poriman 1 er kom hote parbe na");
    }
    if (seen.has(item.medicineId)) {
      throw new Error("Ekta medicine ekbar er beshi order kora jabe na");
    }
    seen.add(item.medicineId);
  }
}

export async function submitOrder(
  items: OrderItemInput[],
): Promise<ActionResult<Serialized<OrderDoc>>> {
  return actionResult(async () => {
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
      if (!medicine || !medicine.active)
        throw new Error("Medicine pawa jay ni");
      lines.push({
        medicineId: medicine._id,
        medicineName: medicine.name,
        form: medicine.form,
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
  });
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

export async function cancelMyOrder(
  orderId: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
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
  });
}

/**
 * The signed balance for the *session's own* buyer — never takes a buyer id
 * as a parameter, unlike the admin-only buyerDueBalance in
 * src/actions/due.ts. That asymmetry is deliberate: an admin is trusted to
 * name any buyer, a buyer is trusted only to read himself. Shares its
 * definition with the admin ledger via src/lib/dueComputation.ts so the two
 * screens can never silently disagree about what a buyer owes.
 */
export async function myDueBalance(): Promise<number> {
  const session = await requireBuyerAction();
  await connectDb();
  return computeBuyerDue(session.userId);
}

/** The session's own sales/payments history — see myDueBalance above. */
export async function myLedger(): Promise<{
  sales: Serialized<SaleDoc>[];
  payments: Serialized<PaymentDoc>[];
}> {
  const session = await requireBuyerAction();
  await connectDb();
  const { sales, payments } = await loadBuyerLedger(session.userId);
  return { sales: toPlainList(sales), payments: toPlainList(payments) };
}
