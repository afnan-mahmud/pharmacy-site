"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectDb } from "@/lib/db";
import { requireAdminAction } from "@/lib/session";
import { toPlain, toPlainList, type Serialized } from "@/lib/serialize";
import { MedicineModel, type MedicineDoc } from "@/models/Medicine";
import {
  isMedicineForm,
  toMedicineForm,
  type MedicineForm,
} from "@/lib/unitLabels";

export type MedicineInput = {
  name: string;
  genericName: string;
  company: string;
  // Which unit words this medicine is shown with. Omitted means "tablet",
  // which is what every medicine created before this field existed is.
  form?: MedicineForm;
  patasPerBox: number;
  boxPricePaisa: number;
  pataPricePaisa: number;
  // Optional list price (MRP) per box for the struck-through display; omitted
  // or 0 means no MRP. When present it must sit at or above boxPricePaisa.
  mrpBoxPricePaisa?: number;
  lowStockThreshold: number;
};

/** Escapes regex metacharacters so a typed "." or "*" is matched literally. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rejects anything that isn't a finite, non-negative integer: fractional
 * values, NaN, Infinity, and non-number types all fail `Number.isInteger`
 * and are rejected here. Money is integer paisa and stock is integer
 * patas — never floats — so this is the one gate all such fields pass
 * through.
 */
function validateNonNegativeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number`);
  }
  if (value < 0) {
    throw new Error(`${label} cannot be negative`);
  }
}

/**
 * genericName and company are optional everywhere else in the system: the
 * Medicine schema defaults both to `""` (src/models/Medicine.ts). A payload
 * that omits them or sends `null` is treated the same way here — coerced to
 * `""` — so server actions behave consistently with direct model writes.
 * Any other type (number, object, etc.) is rejected rather than silently
 * stringified, since this is a network-reachable trust boundary.
 */
function toOptionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function validate(input: MedicineInput): void {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Medicine name is required");
  }
  // Validated for its side effect (throwing on a non-string genericName /
  // company); toFields() re-derives the actual field values below.
  toOptionalString(input.genericName, "genericName");
  toOptionalString(input.company, "company");

  // Undefined is the "not specified" case and defaults to tablet in
  // toFields(); anything else present must be a form we actually know.
  if (input.form !== undefined && !isMedicineForm(input.form)) {
    throw new Error("Medicine form thik nai");
  }

  if (
    typeof input.patasPerBox !== "number" ||
    !Number.isInteger(input.patasPerBox) ||
    input.patasPerBox < 1
  ) {
    throw new Error("patasPerBox must be at least 1");
  }
  validateNonNegativeInteger(input.boxPricePaisa, "boxPricePaisa");
  validateNonNegativeInteger(input.pataPricePaisa, "pataPricePaisa");
  const mrp = input.mrpBoxPricePaisa ?? 0;
  validateNonNegativeInteger(mrp, "mrpBoxPricePaisa");
  validateNonNegativeInteger(input.lowStockThreshold, "lowStockThreshold");

  // MRP is the struck-through "was" price, so it must sit above the selling
  // box price — an MRP below it would show a negative discount. 0 is the
  // "no MRP" sentinel and is always allowed.
  if (mrp > 0 && mrp < input.boxPricePaisa) {
    throw new Error("MRP pack rate er cheye kom hote parbe na");
  }
}

function toFields(input: MedicineInput) {
  const name = input.name.trim();
  return {
    name,
    nameLower: name.toLowerCase(),
    genericName: toOptionalString(input.genericName, "genericName").trim(),
    company: toOptionalString(input.company, "company").trim(),
    form: toMedicineForm(input.form),
    patasPerBox: input.patasPerBox,
    boxPricePaisa: input.boxPricePaisa,
    pataPricePaisa: input.pataPricePaisa,
    mrpBoxPricePaisa: input.mrpBoxPricePaisa ?? 0,
    lowStockThreshold: input.lowStockThreshold,
  };
}

export async function createMedicine(
  input: MedicineInput,
): Promise<Serialized<MedicineDoc>> {
  await requireAdminAction();
  await connectDb();
  validate(input);

  try {
    const medicine = await MedicineModel.create(toFields(input));
    revalidatePath("/medicines");
    return toPlain(medicine.toObject() as MedicineDoc);
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
): Promise<Serialized<MedicineDoc>> {
  await requireAdminAction();
  await connectDb();
  validate(input);

  // A malformed id would otherwise reach the driver and surface a raw
  // Mongoose CastError instead of a clean "not found".
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Medicine not found");
  }

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
    return toPlain(medicine);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new Error(`Medicine "${input.name.trim()}" already exists`);
    }
    throw error;
  }
}

export async function listMedicines(query?: string): Promise<Serialized<MedicineDoc>[]> {
  await requireAdminAction();
  await connectDb();

  // query is optional, so undefined/null are treated as "no filter" — the
  // same leniency toOptionalString gives genericName/company above. Any
  // other non-string type (number, object, array, ...) is a malformed
  // payload on this network-reachable trust boundary and is rejected
  // rather than allowed to reach .trim() as a raw TypeError.
  const term = toOptionalString(query, "query").trim();

  const filter: Record<string, unknown> = { active: true };
  if (term) {
    filter.name = { $regex: escapeRegex(term), $options: "i" };
  }

  const docs = await MedicineModel.find(filter).sort({ name: 1 }).lean<MedicineDoc[]>();
  return toPlainList(docs);
}

export async function searchMedicines(
  query: string,
  limit = 10,
): Promise<Serialized<MedicineDoc>[]> {
  await requireAdminAction();
  await connectDb();
  // query is required here (same convention as the `name` check in
  // validate() above), so unlike listMedicines, undefined/null are
  // rejected rather than defaulted — this is the type-ahead's every-
  // keystroke entry point and must never let a malformed payload reach
  // .trim() as a raw TypeError.
  if (typeof query !== "string") {
    throw new Error("query must be a string");
  }
  const term = query.trim();
  if (!term) return [];

  const pattern = { $regex: escapeRegex(term), $options: "i" };
  const docs = await MedicineModel.find({
    active: true,
    $or: [{ name: pattern }, { genericName: pattern }],
  })
    .sort({ name: 1 })
    .limit(limit)
    .lean<MedicineDoc[]>();
  return toPlainList(docs);
}

export async function deactivateMedicine(id: string): Promise<void> {
  await requireAdminAction();
  await connectDb();
  // A malformed id would otherwise reach the driver and surface a raw
  // Mongoose CastError instead of a clean "not found".
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Medicine not found");
  }
  // Deactivated, not deleted: past sales reference this medicine.
  await MedicineModel.findByIdAndUpdate(id, { $set: { active: false } });
  revalidatePath("/medicines");
}
