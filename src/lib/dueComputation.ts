import mongoose from "mongoose";
import { SaleModel, type SaleDoc } from "@/models/Sale";
import { PaymentModel, type PaymentDoc } from "@/models/Payment";

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

/** A buyer's wholesale sales and payments, newest first — the raw docs. */
export async function loadBuyerLedger(
  buyerId: string,
): Promise<{ sales: SaleDoc[]; payments: PaymentDoc[] }> {
  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    return { sales: [], payments: [] };
  }
  const id = new mongoose.Types.ObjectId(buyerId);

  const [sales, payments] = await Promise.all([
    SaleModel.find({ buyerId: id, type: "wholesale" })
      .sort({ createdAt: -1 })
      .lean<SaleDoc[]>(),
    PaymentModel.find({ buyerId: id })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc[]>(),
  ]);
  return { sales, payments };
}
