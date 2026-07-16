"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { boxesToPatas } from "@/lib/units";
import { MedicineModel } from "@/models/Medicine";
import { StockEntryModel, type StockEntryDoc } from "@/models/StockEntry";

export type StockInInput = {
  medicineId: string;
  boxes: number;
  note: string;
  userId: string;
};

export async function stockIn(input: StockInInput): Promise<void> {
  await connectDb();

  if (!Number.isInteger(input.boxes) || input.boxes < 1) {
    throw new Error("Box সংখ্যা 1 er kom hote parbe na");
  }

  const medicine = await MedicineModel.findById(input.medicineId);
  if (!medicine) throw new Error("Medicine not found");

  const patasAdded = boxesToPatas(input.boxes, medicine.patasPerBox);

  // The stock increment and the audit record must both land or neither:
  // an increment without a record is stock nobody can account for.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await MedicineModel.updateOne(
        { _id: medicine._id },
        { $inc: { stockPatas: patasAdded } },
        { session },
      );
      await StockEntryModel.create(
        [
          {
            medicineId: medicine._id,
            medicineName: medicine.name,
            boxes: input.boxes,
            patasAdded,
            note: input.note.trim(),
            createdBy: new mongoose.Types.ObjectId(input.userId),
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
  await connectDb();
  return StockEntryModel.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<StockEntryDoc[]>();
}
