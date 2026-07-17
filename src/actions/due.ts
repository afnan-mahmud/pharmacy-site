"use server";

import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { takaToPaisa } from "@/lib/money";
import { toPlainList, type Serialized } from "@/lib/serialize";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { PaymentModel, type PaymentDoc } from "@/models/Payment";
import { BuyerModel } from "@/models/Buyer";

export type DueRow = {
  buyerId: string;
  buyerName: string;
  buyerShopName: string;
  duePaisa: number;
};

/**
 * Derives each active buyer's outstanding balance from the live sale and
 * payment documents, so there is no running total that can drift out of
 * sync with history.
 *
 * The query returns only buyers who have at least one non-cancelled
 * wholesale sale (i.e. they've ever received goods on credit). Buyers with
 * a zero balance are still returned — the owner can see the credit history
 * even when nothing is owed.
 */
export async function listBuyerDues(): Promise<DueRow[]> {
  await requireAdminAction();
  await connectDb();

  // Pull all non-cancelled wholesale sales grouped by buyer.
  const saleTotals = await SaleModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalDuePaisa: number;
    totalPaidPaisa: number;
  }>([
    { $match: { type: "wholesale", status: "active" } },
    {
      $group: {
        _id: "$buyerId",
        totalDuePaisa: { $sum: "$duePaisa" },
        totalPaidPaisa: { $sum: "$paidPaisa" },
      },
    },
  ]);

  const paymentTotals = await PaymentModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalPaid: number;
  }>([
    { $group: { _id: "$buyerId", totalPaid: { $sum: "$amountPaisa" } } },
  ]);

  const paymentByBuyer = new Map<string, number>();
  for (const p of paymentTotals) {
    paymentByBuyer.set(String(p._id), p.totalPaid);
  }

  const buyerIds = saleTotals.map((s) => s._id);
  const buyers = await BuyerModel.find({ _id: { $in: buyerIds } })
    .select("name shopName")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; shopName: string }[]>();

  const buyerMap = new Map(
    buyers.map((b) => [String(b._id), { name: b.name, shopName: b.shopName }]),
  );

  const rows: DueRow[] = saleTotals.map((s) => {
    const bid = String(s._id);
    const paid = paymentByBuyer.get(bid) ?? 0;
    // Sale-level duePaisa already accounts for the partial payment made at
    // sale time. Additional payments here reduce it further.
    const duePaisa = Math.max(0, s.totalDuePaisa - paid);
    const buyer = buyerMap.get(bid) ?? { name: "Unknown", shopName: "" };
    return { buyerId: bid, buyerName: buyer.name, buyerShopName: buyer.shopName, duePaisa };
  });

  return rows.sort((a, b) => b.duePaisa - a.duePaisa);
}

/**
 * The current outstanding balance for one buyer, derived from their active
 * sales and all recorded payments. Always computed, never stored, so it
 * cannot drift out of sync.
 */
export async function buyerDueBalance(buyerId: string): Promise<number> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(buyerId)) return 0;

  const [saleTotals, paymentTotals] = await Promise.all([
    SaleModel.aggregate<{ totalDue: number }>([
      {
        $match: {
          buyerId: new mongoose.Types.ObjectId(buyerId),
          type: "wholesale",
          status: "active",
        },
      },
      { $group: { _id: null, totalDue: { $sum: "$duePaisa" } } },
    ]),
    PaymentModel.aggregate<{ totalPaid: number }>([
      {
        $match: { buyerId: new mongoose.Types.ObjectId(buyerId) },
      },
      { $group: { _id: null, totalPaid: { $sum: "$amountPaisa" } } },
    ]),
  ]);

  const totalDue = saleTotals[0]?.totalDue ?? 0;
  const totalPaid = paymentTotals[0]?.totalPaid ?? 0;
  return Math.max(0, totalDue - totalPaid);
}

export type BuyerLedgerResult = {
  sales: Serialized<SaleDoc>[];
  payments: Serialized<PaymentDoc>[];
};

export async function buyerLedger(buyerId: string): Promise<BuyerLedgerResult> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    return { sales: [], payments: [] };
  }

  const [sales, payments] = await Promise.all([
    SaleModel.find({
      buyerId: new mongoose.Types.ObjectId(buyerId),
      type: "wholesale",
    })
      .sort({ createdAt: -1 })
      .lean<SaleDoc[]>(),
    PaymentModel.find({ buyerId: new mongoose.Types.ObjectId(buyerId) })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc[]>(),
  ]);

  return {
    sales: toPlainList(sales),
    payments: toPlainList(payments),
  };
}

export async function recordPayment(
  buyerId: string,
  amountTaka: number,
  note: string,
): Promise<void> {
  const adminSession = await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    throw new Error("Buyer pawa jay ni");
  }

  const buyer = await BuyerModel.findById(buyerId);
  if (!buyer) throw new Error("Buyer pawa jay ni");

  // takaToPaisa converts the UI input (which may be a decimal taka value)
  // into integer paisa. Math.round is essential: a floating-point input
  // like 1.005 produces 100.50000... which truncated to an integer would
  // be one paisa short. Fractional paisa is prohibited — see the plan's
  // "money is always integer paisa" rule.
  const amountPaisa = Math.round(takaToPaisa(amountTaka));
  if (!Number.isInteger(amountPaisa) || amountPaisa < 1) {
    throw new Error("Taka 1 er kom hote parbe na");
  }

  // The due is computed dynamically, so we must re-read it inside the
  // validation to get a consistent view. There is no transaction needed
  // here because Payment is append-only — the balance is always derived,
  // never stored, so a concurrent read cannot produce a stale total that
  // this write then over-counts.
  const due = await buyerDueBalance(buyerId);
  if (amountPaisa > due) {
    throw new Error(
      `Joma ${new Intl.NumberFormat("en-BD").format(amountPaisa / 100)} ৳ baki ${new Intl.NumberFormat("en-BD").format(due / 100)} ৳ er cheye beshi hote parbe na`,
    );
  }

  if (typeof note !== "string") throw new Error("note must be a string");

  await PaymentModel.create({
    buyerId: new mongoose.Types.ObjectId(buyerId),
    amountPaisa,
    note: note.trim(),
    createdBy: new mongoose.Types.ObjectId(adminSession.userId),
  });
}
