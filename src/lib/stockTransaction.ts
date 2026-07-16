import type { ClientSession, Types } from "mongoose";
import { MedicineModel } from "@/models/Medicine";

/**
 * Applies a signed patas delta to a medicine's stock via a single
 * conditional update, instead of a separate read-then-write.
 *
 * The precondition that must hold for the write to be allowed — the medicine
 * still exists, *and*, for a decrement, that there is enough stock to cover
 * it — lives in the update filter itself: `stockPatas >= -delta` is just
 * `stockPatas + delta >= 0` rearranged. That puts the check and the write in
 * the same atomic operation, so nothing can race between "is this safe?" and
 * "do it". `matchedCount === 0` afterwards means the precondition failed.
 *
 * This is why a separate pre-read is not a safe substitute: Mongoose's
 * `min: 0` on `Medicine.stockPatas` only runs on `save()`/`validate()` —
 * it does **not** run on `$inc`. A bare `updateOne({ _id }, { $inc: {
 * stockPatas: delta } })` happily takes stock negative; the only thing
 * `matchedCount` tells you there is whether `_id` still matched *something*,
 * which for a decrement is not the question that matters.
 *
 * `matchedCount === 0` is deliberately ambiguous between "not found" and
 * "insufficient stock" — this function returns a plain boolean rather than
 * trying to distinguish them. A caller that needs a specific message for
 * each (e.g. order-approval telling a buyer "out of stock" vs "no such
 * medicine") must re-read the document — inside the same transaction, so
 * the retry-on-TransientTransactionError semantics of `withTransaction`
 * still apply — to find out which. Collapsing that into one boolean here
 * would bake in a guess about which distinction every future caller needs.
 *
 * stockIn (src/actions/stock.ts) calls this with an always-positive delta,
 * where the quantity half of the precondition can never fail — only
 * existence can. It still routes through here rather than a bare `$inc`
 * because this function is the template the Buyer portal's order-approval
 * flow is expected to copy for its stock *decrement*; a template that only
 * ever demonstrates the safe shape for increments would teach the wrong
 * lesson to the next author who reads it.
 *
 * Must be called from inside an already-open transaction session.
 */
export async function applyStockDelta(
  medicineId: Types.ObjectId,
  delta: number,
  session: ClientSession,
): Promise<boolean> {
  const result = await MedicineModel.updateOne(
    { _id: medicineId, stockPatas: { $gte: -delta } },
    { $inc: { stockPatas: delta } },
    { session },
  );
  return result.matchedCount > 0;
}
