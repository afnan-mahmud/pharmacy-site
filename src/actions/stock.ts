"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { toPlainList, type Serialized } from "@/lib/serialize";
import { boxesToPatas } from "@/lib/units";
import { applyStockDelta } from "@/lib/stockTransaction";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel, type StockEntryDoc } from "@/models/StockEntry";
import { actionResult, type ActionResult } from "@/lib/actionResult";
import { parseOptionalDate } from "@/lib/dhakaDate";

export type StockInInput = {
  medicineId: string;
  boxes: number;
  note: string;
  expiryDate?: string | Date | null;
};

/**
 * This action is a network-reachable trust boundary (same convention as
 * src/actions/medicines.ts): every field is validated here before it
 * touches Mongoose/Mongo, so a malformed payload fails with a clean domain
 * error instead of a raw CastError or driver exception.
 *
 * `userId` used to live on StockInInput and be validated here too, but it
 * was client-supplied — trivially spoofable, since StockInForm posted
 * back whatever `userId` prop it was handed. StockEntry.createdBy must be
 * an honest audit trail, so it now comes solely from the caller's
 * server-side session (see stockIn below), never from input the caller
 * controls.
 */
function validate(input: StockInInput): void {
  // A malformed id would otherwise reach findById and surface a raw
  // Mongoose CastError instead of a clean "not found".
  if (!mongoose.Types.ObjectId.isValid(input.medicineId)) {
    throw new Error("Medicine not found");
  }
  if (
    typeof input.boxes !== "number" ||
    !Number.isInteger(input.boxes) ||
    input.boxes < 1
  ) {
    throw new Error("Poriman 1 er kom hote parbe na");
  }
  if (typeof input.note !== "string") {
    throw new Error("note must be a string");
  }
  parseOptionalDate(input.expiryDate, "expiryDate");
}

export async function stockIn(
  input: StockInInput,
): Promise<ActionResult<void>> {
  return actionResult(async () => {
    const adminSession = await requireAdminAction();
    await connectDb();
    validate(input);
    const parsedExpiry = parseOptionalDate(input.expiryDate, "expiryDate");

    // The stock increment and the audit record must both land or neither:
    // an increment without a record is stock nobody can account for, and a
    // record without an increment is a lie in the audit log.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // The read lives *inside* withTransaction, not before it. MongoDB
        // retries this callback from the top on a TransientTransactionError
        // (e.g. a write conflict) — a read taken before the transaction opened
        // would not be re-evaluated by that retry, so a retry could act on
        // data that is already stale by the time it runs. Reading in here
        // means every attempt, including retries, sees a fresh document.
        const medicine = await MedicineModel.findById(input.medicineId).session(
          session,
        );
        if (!medicine) throw new Error("Medicine not found");

        const patasAdded = boxesToPatas(input.boxes, medicine.patasPerBox);

        // See src/lib/stockTransaction.ts for why this goes through
        // applyStockDelta rather than a bare `updateOne(..., { $inc })`, even
        // though stockIn's delta is always positive so the only way this can
        // fail is if the medicine itself no longer exists. matchedCount === 0
        // here can only mean the medicine stopped existing in the (very
        // small) window since the read above, which this treats as the same
        // "not found" failure the read itself already guards against.
        const matched = await applyStockDelta(
          medicine._id,
          patasAdded,
          session,
        );
        if (!matched) throw new Error("Medicine not found");

        if (parsedExpiry !== null) {
          await MedicineModel.findByIdAndUpdate(
            medicine._id,
            { $set: { expiryDate: parsedExpiry } },
            { session },
          );
        }

        await StockEntryModel.create(
          [
            {
              medicineId: medicine._id,
              medicineName: medicine.name,
              boxes: input.boxes,
              patasAdded,
              form: medicine.form,
              note: input.note.trim(),
              expiryDate: parsedExpiry,
              createdBy: new mongoose.Types.ObjectId(adminSession.userId),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    revalidatePath("/medicines");
  });
}

export async function listStockEntries(
  medicineId?: string,
  limit = 50,
): Promise<Serialized<StockEntryDoc>[]> {
  await requireAdminAction();
  await connectDb();

  const filter: Record<string, unknown> = {};
  if (medicineId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(medicineId)) return [];
    filter.medicineId = medicineId;
  }

  const docs = await StockEntryModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<StockEntryDoc[]>();
  return toPlainList(docs);
}
