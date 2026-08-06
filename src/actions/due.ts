"use server";

import mongoose from "mongoose";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { takaToPaisa } from "@/lib/money";
import { toPlainList, type Serialized } from "@/lib/serialize";
import { computeBuyerDue, loadBuyerLedger } from "@/lib/dueComputation";
import { computeRetailDue, loadRetailLedger } from "@/lib/retailDueComputation";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { PaymentModel, type PaymentDoc } from "@/models/Payment";
import { BuyerModel } from "@/models/Buyer";
import { RetailCustomerModel } from "@/models/RetailCustomer";
import { RetailPaymentModel, type RetailPaymentDoc } from "@/models/RetailPayment";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import { splitDueTotals } from "@/lib/dueDisplay";

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
 * A buyer appears here if they have a non-cancelled wholesale sale, OR if
 * they have ever made a payment. Buyers with a zero balance are still
 * returned — the owner can see the credit history even when nothing is owed.
 *
 * That second clause is load-bearing, not defensive. A buyer whose sales
 * were all cancelled after they had already paid holds a credit, and the
 * owner's rule is that the money stays as credit toward their next purchase
 * rather than being refunded. Keyed off active sales alone, such a buyer
 * produced no row at all: they vanished from the due list, their credit was
 * missing from the dashboard's "joma" total, and the ledger — reachable only
 * by clicking their row — became unreachable. Meanwhile computeBuyerDue,
 * which the buyer's own portal reads, reported the credit correctly, so the
 * two sides of the app disagreed about the same money.
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
/**
 * Every buyer's signed balance, keyed by buyer id.
 *
 * The single read behind both the due ledger and the dashboard's summary
 * figures, so the two screens cannot drift into reporting different money —
 * the same reason splitDueTotals is shared rather than reimplemented.
 *
 * Cost tracks the number of active wholesale sales, and stays that way on
 * purpose. Caching a running total per buyer would make this O(1), and would
 * also be a number that can silently disagree with the sales it came from:
 * it would have to be kept correct in writeWholesaleSale, updateSale,
 * cancelSale and recordPayment alike, and C-1 is a recent demonstration of
 * how quietly one of those goes wrong. Deriving it means the answer is
 * always whatever the documents actually say. What was worth fixing is the
 * constant: both aggregations are answered from index keys now, with no
 * document fetched by either.
 */
async function wholesaleBalances(): Promise<Map<string, number>> {
  // Pull all non-cancelled wholesale sales grouped by buyer. Sums duePaisa
  // and nothing else: this used to sum paidPaisa alongside it, which no
  // caller ever read — and the extra field is the difference between an
  // index-only scan and fetching every matching sale document, because
  // Sale's { type, status, buyerId, duePaisa } index covers exactly this
  // shape and no more.
  const saleTotals = await SaleModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalDuePaisa: number;
  }>([
    { $match: { type: "wholesale", status: "active" } },
    { $group: { _id: "$buyerId", totalDuePaisa: { $sum: "$duePaisa" } } },
  ]);

  // Just the ids of everyone who has ever paid, not their payments. A
  // distinct on an indexed field is answered by a DISTINCT_SCAN that walks
  // one key per buyer, so this stays cheap as payments accumulate: its cost
  // tracks how many buyers the pharmacy has, which does not grow, rather than
  // how many payments they have made, which does.
  // Cast because Mongoose's distinct() resolves its element type through a
  // conditional over the schema's paths that lands on `unknown` here; the
  // field is a required ObjectId (see src/models/Payment.ts).
  const payerIds = (await PaymentModel.distinct(
    "buyerId",
  )) as mongoose.Types.ObjectId[];

  // Matched to the payers rather than left unfiltered: an unfiltered $group
  // has no predicate to match an index against and always collection-scans,
  // whereas this one is served from Payment's { buyerId, amountPaisa } index
  // without fetching a single document. payerIds already covers every payment
  // in the collection, so narrowing it this way costs no rows.
  const paymentTotals = await PaymentModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalPaid: number;
  }>([
    { $match: { buyerId: { $in: payerIds } } },
    { $group: { _id: "$buyerId", totalPaid: { $sum: "$amountPaisa" } } },
  ]);

  // Walking both sides into one map is also what forms the union of "has an
  // active sale" and "has ever paid" — the two ways a buyer can have a
  // balance worth showing. See listBuyerDues on why the second clause is
  // load-bearing rather than defensive.
  const balances = new Map<string, number>();
  for (const s of saleTotals) {
    balances.set(String(s._id), s.totalDuePaisa);
  }
  for (const p of paymentTotals) {
    const key = String(p._id);
    balances.set(key, (balances.get(key) ?? 0) - p.totalPaid);
  }
  return balances;
}

export async function listBuyerDues(): Promise<DueRow[]> {
  await requireAdminAction();
  await connectDb();

  const balances = await wholesaleBalances();

  const buyers = await BuyerModel.find({ _id: { $in: [...balances.keys()] } })
    .select("name shopName")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; shopName: string }[]>();

  const buyerMap = new Map(
    buyers.map((b) => [String(b._id), { name: b.name, shopName: b.shopName }]),
  );

  const rows: DueRow[] = [...balances].map(([buyerId, duePaisa]) => {
    const buyer = buyerMap.get(buyerId) ?? { name: "Unknown", shopName: "" };
    return {
      buyerId,
      buyerName: buyer.name,
      buyerShopName: buyer.shopName,
      duePaisa,
    };
  });

  return rows.sort((a, b) => b.duePaisa - a.duePaisa);
}

/**
 * Just the two figures the dashboard shows, without the per-buyer rows.
 *
 * The dashboard called listBuyerDues and threw away everything but this,
 * which meant fetching every buyer's name and building a row per buyer on
 * the screen the owner opens after every login. Shares wholesaleBalances and
 * splitDueTotals with the ledger, so the two can still never disagree about
 * the same money.
 */
export async function buyerDueTotals(): Promise<{
  totalDuePaisa: number;
  totalCreditPaisa: number;
}> {
  await requireAdminAction();
  await connectDb();

  const balances = await wholesaleBalances();
  return splitDueTotals([...balances.values()].map((duePaisa) => ({ duePaisa })));
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

  return computeBuyerDue(buyerId);
}

export type BuyerLedgerResult = {
  sales: Serialized<SaleDoc>[];
  payments: Serialized<PaymentDoc>[];
  /** Entries in the whole ledger, of which the above is the newest window. */
  totalEntries: number;
};

export async function buyerLedger(
  buyerId: string,
  limit?: number,
): Promise<BuyerLedgerResult> {
  await requireAdminAction();
  await connectDb();

  const { sales, payments, totalEntries } = await loadBuyerLedger(buyerId, limit);

  return {
    sales: toPlainList(sales),
    payments: toPlainList(payments),
    totalEntries,
  };
}

export async function recordPayment(
  buyerId: string,
  amountTaka: number,
  note: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
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
          { session, returnDocument: "after" },
        );
        if (!buyer) throw new Error("Buyer pawa jay ni");

        // Read inside the transaction so a TransientTransactionError retry
        // (see above) re-evaluates the due balance against the latest
        // committed state, not a stale value captured before the retry.
        const due = await computeBuyerDue(buyerId, session);

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
  });
}

export type RetailDueRow = {
  phone: string;
  customerName: string;
  duePaisa: number;
};

/**
 * Same shape as listBuyerDues but grouped by phone instead of buyerId, and
 * only over retail sales. A phone appears if it has an active retail sale OR
 * a retail payment on file — the same union, for the same reason, as
 * listBuyerDues; see that function's comment on why a customer whose sales
 * were all cancelled after paying must not disappear along with them.
 */
export async function listRetailDues(): Promise<RetailDueRow[]> {
  await requireAdminAction();
  await connectDb();

  const saleTotals = await SaleModel.aggregate<{
    _id: string;
    totalDuePaisa: number;
  }>([
    { $match: { type: "retail", status: "active", buyerPhone: { $gt: "" } } },
    { $group: { _id: "$buyerPhone", totalDuePaisa: { $sum: "$duePaisa" } } },
  ]);

  // The phone-keyed counterparts of listBuyerDues' payerIds/allIds — see
  // there for why the distinct and the $match are shaped this way. The empty
  // string is filtered out to match the sale side's `buyerPhone: { $gt: "" }`:
  // a counter sale where the customer gave no number is nobody's balance.
  const payerPhones = (
    (await RetailPaymentModel.distinct("phone")) as string[]
  ).filter((phone) => phone !== "");

  const allPhones = [...new Set([...saleTotals.map((s) => s._id), ...payerPhones])];

  const paymentTotals = await RetailPaymentModel.aggregate<{
    _id: string;
    totalPaid: number;
  }>([
    { $match: { phone: { $in: payerPhones } } },
    { $group: { _id: "$phone", totalPaid: { $sum: "$amountPaisa" } } },
  ]);

  const paymentByPhone = new Map<string, number>();
  for (const p of paymentTotals) {
    paymentByPhone.set(p._id, p.totalPaid);
  }

  const dueByPhone = new Map<string, number>();
  for (const s of saleTotals) {
    dueByPhone.set(s._id, s.totalDuePaisa);
  }

  const customers = await RetailCustomerModel.find({ phone: { $in: allPhones } })
    .select("phone name")
    .lean<{ phone: string; name: string }[]>();
  const nameByPhone = new Map(customers.map((c) => [c.phone, c.name]));

  const rows: RetailDueRow[] = allPhones.map((phone) => ({
    phone,
    customerName: nameByPhone.get(phone) ?? "",
    duePaisa: (dueByPhone.get(phone) ?? 0) - (paymentByPhone.get(phone) ?? 0),
  }));

  return rows.sort((a, b) => b.duePaisa - a.duePaisa);
}

export async function retailDueBalance(phone: string): Promise<number> {
  await requireAdminAction();
  await connectDb();
  if (typeof phone !== "string") return 0;
  return computeRetailDue(phone);
}

export type RetailLedgerResult = {
  sales: Serialized<SaleDoc>[];
  payments: Serialized<RetailPaymentDoc>[];
  /** Entries in the whole ledger, of which the above is the newest window. */
  totalEntries: number;
};

export async function retailLedger(
  phone: string,
  limit?: number,
): Promise<RetailLedgerResult> {
  await requireAdminAction();
  await connectDb();
  if (typeof phone !== "string") return { sales: [], payments: [], totalEntries: 0 };

  const { sales, payments, totalEntries } = await loadRetailLedger(phone, limit);
  return { sales: toPlainList(sales), payments: toPlainList(payments), totalEntries };
}

/**
 * Records a payment against a retail customer's phone-keyed due, mirroring
 * recordPayment. Bumps RetailCustomer.__v as the write-conflict anchor —
 * see recordPayment's comment for why a plain read-then-insert would race
 * under a double-click; the mechanism here is identical, just phone-keyed.
 * The customer must already exist (no upsert): a payment against a phone
 * nobody has ever sold to has nothing to pay against.
 */
export async function recordRetailPayment(
  phone: string,
  amountTaka: number,
  note: string,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();

    if (typeof phone !== "string" || !phone.trim()) {
      throw new Error("Phone number thik nai");
    }
    const trimmedPhone = phone.trim();

    const amountPaisa = Math.round(takaToPaisa(amountTaka));
    if (!Number.isInteger(amountPaisa) || amountPaisa < 1) {
      throw new Error("Taka 1 er kom hote parbe na");
    }
    if (typeof note !== "string") throw new Error("note must be a string");

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const customer = await RetailCustomerModel.findOneAndUpdate(
          { phone: trimmedPhone },
          { $inc: { __v: 1 } },
          { session, returnDocument: "after" },
        );
        if (!customer) {
          throw new Error("Ei phone number-e kono customer pawa jay ni");
        }

        const due = await computeRetailDue(trimmedPhone, session);

        if (due <= 0) {
          throw new Error(
            due < 0
              ? `Ei customer-er kono baki nei — uni borong ${new Intl.NumberFormat("en-BD").format(-due / 100)} ৳ joma ache, notun kore joma neoya lagbe na`
              : "Ei customer-er kono baki nei, joma neoya lagbe na",
          );
        }
        if (amountPaisa > due) {
          throw new Error(
            `Joma ${new Intl.NumberFormat("en-BD").format(amountPaisa / 100)} ৳ baki ${new Intl.NumberFormat("en-BD").format(due / 100)} ৳ er cheye beshi hote parbe na`,
          );
        }

        await RetailPaymentModel.create(
          [
            {
              phone: trimmedPhone,
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
  });
}
