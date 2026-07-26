import type { ClientSession, Types } from "mongoose";
import { MedicineModel } from "@/models/Medicine";

/**
 * Applies a signed patas delta to a medicine's stock via a single
 * conditional update, instead of a separate read-then-write.
 *
 * Stock is allowed to go negative — a wholesale or retail sale, or a
 * buyer-order approval, may take more than is on hand. The only
 * precondition is that the medicine still exists. A decrement that would
 * take stock negative is allowed; see src/lib/units.ts's `formatStock` for
 * how negative stock is displayed.
 *
 * `matchedCount === 0` afterwards means only that the medicine no longer
 * exists, not "insufficient stock." A caller that needs to distinguish
 * "not found" from "sold beyond what was on hand" must re-read the
 * document — inside the same transaction, so the retry-on-
 * TransientTransactionError semantics of `withTransaction` still apply —
 * to find out which. This function collapses them into one boolean to avoid
 * baking in a guess about which distinction every future caller needs.
 *
 * This single atomic `$inc` is why a separate pre-read is not a safe
 * substitute. A bare `updateOne({ _id }, { $inc: { stockPatas: delta } })`
 * without a filter would match regardless of quantity and happily take stock
 * negative, but the only thing `matchedCount` would tell you is whether
 * `_id` still matched *something* — not whether the write was safe. The
 * existence check in the filter ensures the medicine has not been deleted
 * between the query and the update. See src/lib/units.ts for formatting
 * negative stock for display.
 *
 * stockIn (src/actions/stock.ts) calls this with an always-positive delta,
 * where existence is the only precondition. It still routes through here
 * rather than a bare `$inc` because this function is the template the Buyer
 * portal's order-approval flow is expected to copy; a template that only
 * ever demonstrates increments would teach the wrong lesson to the next
 * author who reads it.
 *
 * Must be called from inside an already-open transaction session.
 */
export async function applyStockDelta(
  medicineId: Types.ObjectId,
  delta: number,
  session: ClientSession,
): Promise<boolean> {
  const result = await MedicineModel.updateOne(
    { _id: medicineId },
    { $inc: { stockPatas: delta } },
    { session },
  );
  return result.matchedCount > 0;
}
