import mongoose from "mongoose";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { PaymentModel, type PaymentDoc } from "@/models/Payment";
import { LEDGER_WINDOW, MAX_LEDGER_WINDOW } from "@/lib/pagination";

/**
 * A buyer's signed outstanding balance in paisa: positive = the buyer owes,
 * negative = the pharmacy owes him credit. Derived from active wholesale
 * sales and payments — never stored. Cancelled sales are excluded (their due
 * is no longer owed) but their prior payments still count, which is what
 * produces a credit. This is the single definition; both the admin due
 * ledger and the buyer's own account read call it.
 *
 * `session` is optional and exists only so src/actions/due.ts's
 * recordPayment can run this exact read inside its own Mongo transaction
 * (see that file's comment on why a check-then-act balance read must
 * participate in the transaction to be race-safe). Every other caller
 * (buyerDueBalance, the buyer-scoped myDueBalance) omits it and gets a
 * plain, non-transactional read, identical to before the extraction.
 */
export async function computeBuyerDue(
  buyerId: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(buyerId)) return 0;
  const id = new mongoose.Types.ObjectId(buyerId);

  const [saleAgg] = await SaleModel.aggregate<{ total: number }>([
    { $match: { buyerId: id, type: "wholesale", status: "active" } },
    { $group: { _id: null, total: { $sum: "$duePaisa" } } },
  ]).session(session ?? null);
  const [payAgg] = await PaymentModel.aggregate<{ total: number }>([
    { $match: { buyerId: id } },
    { $group: { _id: null, total: { $sum: "$amountPaisa" } } },
  ]).session(session ?? null);

  return (saleAgg?.total ?? 0) - (payAgg?.total ?? 0);
}

/**
 * A buyer's most recent wholesale sales and payments, newest first.
 *
 * Bounded rather than complete. A ledger is read from the top — the owner
 * opens it to see where a balance stands now — but it was fetching a buyer's
 * entire history to do that, which only ever grows. Capping each collection
 * at `limit` is enough to render the newest `limit` entries of the merged
 * stream, because anything in the newest N of the merge is necessarily within
 * the newest N of the collection it came from.
 *
 * `totalEntries` is what the window was taken out of, so the screen can say
 * so instead of quietly presenting a slice as the whole book. The running
 * balance stays correct on a slice because the components compute it
 * *backwards* from the buyer's current balance rather than forwards from
 * zero; see BuyerLedger.
 */
export async function loadBuyerLedger(
  buyerId: string,
  limit = LEDGER_WINDOW,
): Promise<{ sales: SaleDoc[]; payments: PaymentDoc[]; totalEntries: number }> {
  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    return { sales: [], payments: [], totalEntries: 0 };
  }
  const id = new mongoose.Types.ObjectId(buyerId);
  const capped = Math.min(Math.max(Math.trunc(limit) || LEDGER_WINDOW, 1), MAX_LEDGER_WINDOW);

  const [sales, payments, saleCount, paymentCount] = await Promise.all([
    SaleModel.find({ buyerId: id, type: "wholesale" })
      .sort({ createdAt: -1 })
      .limit(capped)
      .lean<SaleDoc[]>(),
    PaymentModel.find({ buyerId: id })
      .sort({ createdAt: -1 })
      .limit(capped)
      .lean<PaymentDoc[]>(),
    SaleModel.countDocuments({ buyerId: id, type: "wholesale" }),
    PaymentModel.countDocuments({ buyerId: id }),
  ]);
  return { sales, payments, totalEntries: saleCount + paymentCount };
}
