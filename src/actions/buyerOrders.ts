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
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { toMedicineForm, type MedicineForm } from "@/lib/unitLabels";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import { assertLineCount, MAX_LINE_ITEMS, TOO_MANY_LINES_ERROR } from "@/lib/lineLimits";

export type OrderItemInput = { medicineId: string; boxes: number; patas: number };
export type CustomOrderItemInput = { name: string; boxes: number; patas: number };

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
  category: string;
  // Which unit words to show. Not sensitive: it is neither the stock count
  // nor a khuchra (retail) price.
  form: MedicineForm;
  patasPerBox: number;
  wholesaleBoxPricePaisa: number;
  wholesalePataPricePaisa: number;
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
  let findFilter: any = { active: true };

  if (term) {
    const pattern = { $regex: escapeRegex(term), $options: "i" };
    findFilter.$or = [{ name: pattern }, { genericName: pattern }];
  }

  // stockPatas and lowStockThreshold are read only to derive the three-way
  // availability signal below — they are never returned to the client. The
  // exact count stays on the server; the buyer sees "in / low / out" only.
  const docs = await MedicineModel.find(findFilter)
    .select(
      "name company category form patasPerBox wholesaleBoxPricePaisa wholesalePataPricePaisa mrpBoxPricePaisa stockPatas lowStockThreshold",
    )
    .sort({ name: 1 })
    .limit(500)
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name: string;
        company: string;
        category?: string;
        form?: string;
        patasPerBox: number;
        wholesaleBoxPricePaisa: number;
        wholesalePataPricePaisa: number;
        mrpBoxPricePaisa: number;
        stockPatas: number;
        lowStockThreshold: number;
      }[]
    >();

  return docs.map((m) => ({
    id: String(m._id),
    name: m.name,
    company: m.company,
    category: m.category ?? "",
    form: toMedicineForm(m.form),
    patasPerBox: m.patasPerBox,
    wholesaleBoxPricePaisa: m.wholesaleBoxPricePaisa,
    wholesalePataPricePaisa: m.wholesalePataPricePaisa,
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
  assertLineCount(items.length);
  const seen = new Set<string>();
  for (const item of items) {
    if (!mongoose.Types.ObjectId.isValid(item.medicineId)) {
      throw new Error("Medicine pawa jay ni");
    }
    if (
      typeof item.boxes !== "number" ||
      !Number.isInteger(item.boxes) ||
      item.boxes < 0
    ) {
      throw new Error("Box er poriman thik nai");
    }
    if (
      typeof item.patas !== "number" ||
      !Number.isInteger(item.patas) ||
      item.patas < 0
    ) {
      throw new Error("Pata er poriman thik nai");
    }
    if (item.boxes === 0 && item.patas === 0) {
      throw new Error("Ontoto ekta box ba pata order korte hobe");
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
        patas: item.patas,
        // Snapshot both wholesale rates the buyer is ordering at.
        wholesaleBoxPricePaisa: medicine.wholesaleBoxPricePaisa,
        wholesalePataPricePaisa: medicine.wholesalePataPricePaisa,
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

/**
 * Returns a specific sale/invoice for the session's own buyer.
 * Scoped by buyerId so a buyer can only ever view their own sales.
 */
export async function getMySale(
  saleId: string,
): Promise<Serialized<SaleDoc> | null> {
  const session = await requireBuyerAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(saleId)) return null;

  const sale = await SaleModel.findOne({
    _id: saleId,
    buyerId: session.userId,
    type: "wholesale",
  }).lean<SaleDoc>();

  return sale ? toPlain(sale) : null;
}

/**
 * Submits a shortlist of items. If the buyer already has a pending order,
 * the new items are merged into it (same medicineId → boxes are summed,
 * new medicineId → appended). If no pending order exists, a fresh one is
 * created — identical in shape to what submitOrder produces.
 *
 * This is the buyer-facing "shortlist" flow: the buyer types product names,
 * the client resolves them to medicineIds via searchMedicinesForBuyer, and
 * this action handles the merge-or-create decision.
 */
export async function submitShortlist(
  items: CustomOrderItemInput[],
): Promise<ActionResult<Serialized<OrderDoc>>> {
  return actionResult(async () => {
    const session = await requireBuyerAction();
    await connectDb();

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Cart khali");
    }
    assertLineCount(items.length);
    for (const item of items) {
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") {
        throw new Error("Product er nam likhte hobe");
      }
      if (typeof item.boxes !== "number" || item.boxes < 0) {
        throw new Error("Box kompokkhe 0 hote hobe");
      }
      if (typeof item.patas !== "number" || item.patas < 0) {
        throw new Error("Pata kompokkhe 0 hote hobe");
      }
      if (item.boxes === 0 && item.patas === 0) {
        throw new Error("Ontoto ekta box ba pata order korte hobe");
      }
    }

    const buyer = await BuyerModel.findById(session.userId);
    if (!buyer || !buyer.active) {
      throw new Error("Apnar account bondho ache");
    }

    // For shortlist, items are custom text. We do not look up in MedicineModel.
    // We map them directly to order lines with medicineId: null.
    const lines: any[] = [];
    for (const item of items) {
      lines.push({
        medicineId: null,
        medicineName: item.name.trim(),
        form: "custom",
        boxes: item.boxes,
        patas: item.patas,
        wholesaleBoxPricePaisa: 0,
        wholesalePataPricePaisa: 0,
      });
    }

    // Look for an existing pending order for this buyer.
    const existing = await OrderModel.findOne({
      buyerId: session.userId,
      status: "pending",
    });

    let order: OrderDoc;

    if (existing) {
      // Merge into the existing pending order. For each new line, if the
      // same name is already in the order (and has no medicineId), add the boxes together;
      // otherwise append a new line.
      const matchIn = (line: { medicineName: string }) =>
        existing.items.find(
          (ci) => ci.medicineId === null && ci.medicineName.toLowerCase() === line.medicineName.toLowerCase(),
        );

      // Checked against the size the order would *become*, not against this
      // request alone: this path appends to one long-lived document, so a
      // buyer adding five items at a time repeatedly would grow it without
      // bound and eventually push it past MongoDB's 16MB document limit — at
      // which point the order can no longer be saved or cleanly read, taking
      // that buyer's portal and the owner's pending-orders list down with it.
      // Counted over *distinct* new names: two lines with the same name in
      // one request merge into a single appended line below, so counting them
      // twice would reject a request that actually fits.
      const presentNames = new Set(
        existing.items
          .filter((ci) => ci.medicineId === null)
          .map((ci) => ci.medicineName.toLowerCase()),
      );
      const appendCount = new Set(
        lines
          .map((line) => line.medicineName.toLowerCase())
          .filter((name) => !presentNames.has(name)),
      ).size;
      if (existing.items.length + appendCount > MAX_LINE_ITEMS) {
        throw new Error(TOO_MANY_LINES_ERROR);
      }

      for (const newLine of lines) {
        const existingLine = matchIn(newLine);
        if (existingLine) {
          // Mutate the subdocument directly so Mongoose detects the change
          existingLine.boxes += newLine.boxes;
          existingLine.patas += newLine.patas;
        } else {
          existing.items.push(newLine);
        }
      }

      await existing.save();
      order = existing.toObject() as OrderDoc;
    } else {
      // No pending order — create a fresh one.
      const created = await OrderModel.create({
        buyerId: buyer._id,
        buyerName: buyer.name,
        buyerShopName: buyer.shopName,
        items: lines,
        status: "pending",
      });
      order = created.toObject() as OrderDoc;
    }

    revalidatePath("/buyer/orders");
    revalidatePath("/buyer/shortlist");
    return toPlain(order);
  });
}
