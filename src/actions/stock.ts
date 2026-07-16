"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { boxesToPatas } from "@/lib/units";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel, type StockEntryDoc } from "@/models/StockEntry";

export type StockInInput = {
  medicineId: string;
  boxes: number;
  note: string;
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
    throw new Error("Box sonkha 1 er kom hote parbe na");
  }
  if (typeof input.note !== "string") {
    throw new Error("note must be a string");
  }
}

export async function stockIn(input: StockInInput): Promise<void> {
  const adminSession = await requireAdminAction();
  await connectDb();
  validate(input);

  const medicine = await MedicineModel.findById(input.medicineId);
  if (!medicine) throw new Error("Medicine not found");

  const patasAdded = boxesToPatas(input.boxes, medicine.patasPerBox);

  // The stock increment and the audit record must both land or neither:
  // an increment without a record is stock nobody can account for, and a
  // record without an increment is a lie in the audit log.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // The medicine was read via findById *before* this session opened, so
      // it could have been deleted (or otherwise stopped matching) in the
      // window between that read and this transaction starting. updateOne
      // matching zero documents is a silent no-op by default — checking
      // matchedCount here, inside the transaction, is what turns that race
      // into a hard abort instead of an audit record for an increment that
      // never happened. This keeps the invariant transaction-local rather
      // than depending on a second round-trip (re-reading inside the
      // session) or a schema-level conditional-update trick, either of
      // which would work but add complexity this doesn't need.
      const result = await MedicineModel.updateOne(
        { _id: medicine._id },
        { $inc: { stockPatas: patasAdded } },
        { session },
      );
      if (result.matchedCount === 0) {
        throw new Error("Medicine not found");
      }

      await StockEntryModel.create(
        [
          {
            medicineId: medicine._id,
            medicineName: medicine.name,
            boxes: input.boxes,
            patasAdded,
            note: input.note.trim(),
            createdBy: new mongoose.Types.ObjectId(adminSession.userId),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  revalidatePath("/stock");
  revalidatePath("/medicines");
}

export async function listStockEntries(limit = 50): Promise<StockEntryDoc[]> {
  await requireAdminAction();
  await connectDb();
  return StockEntryModel.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<StockEntryDoc[]>();
}
