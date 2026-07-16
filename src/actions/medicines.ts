"use server";

import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";

export type MedicineInput = {
  name: string;
  genericName: string;
  company: string;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  lowStockThreshold: number;
};

/** Escapes regex metacharacters so a typed "." or "*" is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validate(input: MedicineInput): void {
  if (!input.name.trim()) throw new Error("Medicine name is required");
  if (!Number.isInteger(input.patasPerBox) || input.patasPerBox < 1) {
    throw new Error("patasPerBox must be at least 1");
  }
  if (input.boxPricePaisa < 0 || input.pataPricePaisa < 0) {
    throw new Error("Price cannot be negative");
  }
  if (input.lowStockThreshold < 0) {
    throw new Error("Low stock threshold cannot be negative");
  }
}

function toFields(input: MedicineInput) {
  return {
    name: input.name.trim(),
    nameLower: input.name.trim().toLowerCase(),
    genericName: input.genericName.trim(),
    company: input.company.trim(),
    patasPerBox: input.patasPerBox,
    boxPricePaisa: input.boxPricePaisa,
    pataPricePaisa: input.pataPricePaisa,
    lowStockThreshold: input.lowStockThreshold,
  };
}

export async function createMedicine(
  input: MedicineInput,
): Promise<MedicineDoc> {
  await connectDb();
  validate(input);

  try {
    const medicine = await MedicineModel.create(toFields(input));
    revalidatePath("/medicines");
    return medicine.toObject();
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error(`Medicine "${input.name.trim()}" already exists`);
    }
    throw error;
  }
}

export async function updateMedicine(
  id: string,
  input: MedicineInput,
): Promise<MedicineDoc> {
  await connectDb();
  validate(input);

  try {
    // stockPatas is deliberately absent from the update: stock only ever
    // changes through stock-in and sales, never through the medicine form.
    const medicine = await MedicineModel.findByIdAndUpdate(
      id,
      { $set: toFields(input) },
      { new: true, runValidators: true },
    ).lean<MedicineDoc>();

    if (!medicine) throw new Error("Medicine not found");
    revalidatePath("/medicines");
    return medicine;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error(`Medicine "${input.name.trim()}" already exists`);
    }
    throw error;
  }
}

export async function listMedicines(query?: string): Promise<MedicineDoc[]> {
  await connectDb();

  const filter: Record<string, unknown> = { active: true };
  if (query?.trim()) {
    filter.name = { $regex: escapeRegex(query.trim()), $options: "i" };
  }

  return MedicineModel.find(filter).sort({ name: 1 }).lean<MedicineDoc[]>();
}

export async function searchMedicines(
  query: string,
  limit = 10,
): Promise<MedicineDoc[]> {
  await connectDb();
  const term = query.trim();
  if (!term) return [];

  const pattern = { $regex: escapeRegex(term), $options: "i" };
  return MedicineModel.find({
    active: true,
    $or: [{ name: pattern }, { genericName: pattern }],
  })
    .sort({ name: 1 })
    .limit(limit)
    .lean<MedicineDoc[]>();
}

export async function deactivateMedicine(id: string): Promise<void> {
  await connectDb();
  // Deactivated, not deleted: past sales reference this medicine.
  await MedicineModel.findByIdAndUpdate(id, { $set: { active: false } });
  revalidatePath("/medicines");
}
