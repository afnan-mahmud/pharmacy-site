import mongoose, { type ClientSession } from "mongoose";
import { SaleModel } from "@/models/Sale";
import { OrderModel } from "@/models/Order";

export const SOLD_MEDICINE_DELETE_ERROR =
  "Ei medicine ta age bikri hoyeche, tai delete kora jabe na — bikri gulo ekhono eta khoje. Bondho (deactivate) kore din, tahole notun kore bikri te ashbe na.";

export const ORDERED_MEDICINE_DELETE_ERROR =
  "Ei medicine ta ekta pending order e ache, tai delete kora jabe na. Age order ta approve ba reject korun.";

/**
 * Refuses to let a medicine be deleted while anything still needs it.
 *
 * Denormalising the name, form and price onto each sale line does keep an
 * old *invoice* readable after the medicine is gone — which is what
 * deleteMedicine used to rely on — but reading is not the only thing a sale
 * has to be able to do. Cancelling one returns each line's stock, and
 * editing one returns the old stock before deducting the new; both go
 * through applyStockDelta, which reports a medicine that no longer exists as
 * a failure and aborts the entire transaction (see src/actions/sales.ts).
 * Deleting a sold medicine therefore froze every sale containing it: it
 * could never be cancelled and never be edited, permanently, including its
 * due. A pending order containing it could likewise never be approved,
 * because approval rebuilds its lines from the live medicine.
 *
 * Sales are checked regardless of status. A cancelled sale can no longer be
 * cancelled or edited, so it is not at risk of freezing — but salesReport
 * still reads the medicine back to recover a line's cost when none was
 * snapshotted, so deleting it would quietly rewrite historical profit.
 * "It has been sold, so it stays" is also a rule the owner can hold in their
 * head, which "…unless the sale was cancelled" is not. Orders are checked
 * only while pending, because that is the only status approval acts on.
 *
 * Lives here rather than inline in deleteMedicine because src/actions is a
 * "use server" module, where every export must be an async function — the
 * two message constants could not be exported from there for the delete
 * button's tests to assert against.
 *
 * MUST be called from inside the same transaction as the delete it guards,
 * so the check cannot go stale between the two: a sale being written
 * concurrently touches the same medicine document the delete removes, so
 * MongoDB reports the conflict and withTransaction retries the callback —
 * and the retry's check sees the sale that has since committed.
 */
export async function assertMedicineIsDeletable(
  medicineId: mongoose.Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  // No index on items.medicineId, deliberately: a delete is a rare, manual
  // action, while indexing an array field inside every sale line would be
  // paid for on every sale written. exists() also stops at the first match,
  // so the case that refuses is the fast one.
  const onASale = await SaleModel.exists({
    "items.medicineId": medicineId,
  }).session(session);
  if (onASale) throw new Error(SOLD_MEDICINE_DELETE_ERROR);

  const onAPendingOrder = await OrderModel.exists({
    status: "pending",
    "items.medicineId": medicineId,
  }).session(session);
  if (onAPendingOrder) throw new Error(ORDERED_MEDICINE_DELETE_ERROR);
}
