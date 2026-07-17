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
 *
 * duePaisa is signed: positive means the buyer owes the pharmacy (Baki),
 * negative means the pharmacy owes the buyer (Joma ache). A buyer goes
 * negative when a sale that was already paid for gets cancelled — Payment
 * has no saleId, so the money that paid for it does not vanish with the
 * sale; the owner's decided rule is that it stays as the buyer's credit
 * toward their next purchase. Clamping this at 0 would silently erase that
 * credit and, worse, could hide a buyer's real remaining debt on their
 * other active sales (see buyerDueBalance's doc comment for the worked
 * example) — so callers must not clamp this value themselves either.
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
    // sale time. Additional payments here reduce it further — and can take
    // it negative (credit); see the module comment above for why that must
    // be allowed through, not clamped.
    const duePaisa = s.totalDuePaisa - paid;
    const buyer = buyerMap.get(bid) ?? { name: "Unknown", shopName: "" };
    return { buyerId: bid, buyerName: buyer.name, buyerShopName: buyer.shopName, duePaisa };
  });

  return rows.sort((a, b) => b.duePaisa - a.duePaisa);
}

/**
 * The current outstanding balance for one buyer, derived from their active
 * sales and all recorded payments. Always computed, never stored, so it
 * cannot drift out of sync.
 *
 * Signed: positive means the buyer owes the pharmacy, negative means the
 * buyer is in credit. This must stay signed (no Math.max(0, ...) clamp) —
 * worked example: buyer takes sale A (৳1200) and sale B (৳600), both
 * unpaid, then makes one buyer-level payment of ৳1200 (Payment has no
 * saleId, so it isn't tied to either sale). Before any cancellation the
 * buyer owes 1800 - 1200 = ৳600. If A is then cancelled, its ৳1200 no
 * longer counts toward the active total, but the ৳1200 payment record
 * still exists and still counts — so the buyer's remaining active
 * obligation is just B's ৳600, against which ৳1200 has already been paid:
 * a net ৳600 *credit*, not the ৳0 a clamp would report (which would hide
 * that they're actually owed money back) and not a naive "still owes ৳600"
 * either (which would ignore the payment entirely).
 */
export async function buyerDueBalance(buyerId: string): Promise<number> {
  await requireAdminAction();
  await connectDb();

  if (!mongoose.Types.ObjectId.isValid(buyerId)) return 0;

  return computeBuyerDueBalance(buyerId);
}

/**
 * The aggregation behind buyerDueBalance, factored out so recordPayment can
 * run the exact same read inside its transaction session — see the
 * "session" param and recordPayment's comment for why that matters.
 */
async function computeBuyerDueBalance(
  buyerId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
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
    ]).session(session ?? null),
    PaymentModel.aggregate<{ totalPaid: number }>([
      {
        $match: { buyerId: new mongoose.Types.ObjectId(buyerId) },
      },
      { $group: { _id: null, totalPaid: { $sum: "$amountPaisa" } } },
    ]).session(session ?? null),
  ]);

  const totalDue = saleTotals[0]?.totalDue ?? 0;
  const totalPaid = paymentTotals[0]?.totalPaid ?? 0;
  return totalDue - totalPaid;
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

  // takaToPaisa converts the UI input (which may be a decimal taka value)
  // into integer paisa. Math.round is essential: a floating-point input
  // like 1.005 produces 100.50000... which truncated to an integer would
  // be one paisa short. Fractional paisa is prohibited — see the plan's
  // "money is always integer paisa" rule.
  const amountPaisa = Math.round(takaToPaisa(amountTaka));
  if (!Number.isInteger(amountPaisa) || amountPaisa < 1) {
    throw new Error("Taka 1 er kom hote parbe na");
  }
  if (typeof note !== "string") throw new Error("note must be a string");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Bumping the buyer document's own versionKey (__v) here is the
      // guard in the write path, the same role cancelSale's conditional
      // updateOne plays for cancellation. The due balance below is a
      // *derived* read across the Sale and Payment collections — nothing
      // about Payment being append-only makes a plain "read the due, then
      // insert a Payment" sequence safe, because two concurrent calls can
      // both read the same due total before either one's insert is
      // visible to the other (a classic check-then-act race: a
      // double-click on "Joma add koro" fires two calls that can both
      // pass the "not more than the due" check and both commit,
      // overcounting the payment). Having both transactions write to this
      // buyer document is what makes MongoDB detect the conflict: when
      // two open transactions try to modify the same document, one gets a
      // TransientTransactionError and withTransaction retries its
      // callback from the top — so the retry's due-balance read below
      // sees the sibling payment that already committed.
      const buyer = await BuyerModel.findOneAndUpdate(
        { _id: buyerId },
        { $inc: { __v: 1 } },
        { session, new: true },
      );
      if (!buyer) throw new Error("Buyer pawa jay ni");

      // Read inside the transaction so a TransientTransactionError retry
      // (see above) re-evaluates the due balance against the latest
      // committed state, not a stale value captured before the retry.
      const due = await computeBuyerDueBalance(buyerId, session);

      // due <= 0 means the buyer owes nothing right now — either square,
      // or already in credit from a cancelled paid-for sale. Either way
      // there is nothing to pay against, so say that plainly instead of
      // falling through to the "more than X ৳" message below, which would
      // otherwise put a negative or zero taka figure in front of the
      // pharmacist.
      if (due <= 0) {
        throw new Error(
          due < 0
            ? `Ei buyer er kono baki nei — uni borong ${new Intl.NumberFormat("en-BD").format(-due / 100)} ৳ joma ache, notun kore joma neoya lagbe na`
            : "Ei buyer er kono baki nei, joma neoya lagbe na",
        );
      }
      if (amountPaisa > due) {
        throw new Error(
          `Joma ${new Intl.NumberFormat("en-BD").format(amountPaisa / 100)} ৳ baki ${new Intl.NumberFormat("en-BD").format(due / 100)} ৳ er cheye beshi hote parbe na`,
        );
      }

      await PaymentModel.create(
        [
          {
            buyerId: new mongoose.Types.ObjectId(buyerId),
            amountPaisa,
            note: note.trim(),
            createdBy: new mongoose.Types.ObjectId(adminSession.userId),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}
