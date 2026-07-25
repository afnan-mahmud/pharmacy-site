import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { MEDICINE_FORMS } from "@/lib/unitLabels";

const medicineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased copy of `name`, used only to enforce case-insensitive
    // uniqueness. Kept in sync by the actions, never edited directly.
    nameLower: { type: String, required: true, unique: true },
    genericName: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    // Which unit words this medicine is described with — box/pata for a
    // tablet strip, carton/bottle for a syrup. Display only: every stock and
    // price field below means the same thing under every form, which is why
    // none of them is renamed. See src/lib/unitLabels.ts.
    form: {
      type: String,
      enum: [...MEDICINE_FORMS],
      required: true,
      default: "tablet",
    },
    patasPerBox: { type: Number, required: true, min: 1 },
    boxPricePaisa: { type: Number, required: true, min: 0 },
    pataPricePaisa: { type: Number, required: true, min: 0 },
    // Optional list price (MRP) per box, for the struck-through "was" price
    // and a discount badge. 0 means no MRP — nothing struck through. When set,
    // it is kept at or above boxPricePaisa (a discount, not a markup).
    mrpBoxPricePaisa: { type: Number, required: true, default: 0, min: 0 },
    // Canonical stock. Always patas, never boxes. May be negative — a sale can
    // outrun what is on hand; see src/lib/stockTransaction.ts. See src/lib/units.ts.
    stockPatas: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

medicineSchema.index({ name: 1 });
medicineSchema.index({ genericName: 1 });

export type MedicineDoc = InferSchemaType<typeof medicineSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MedicineModel: Model<MedicineDoc> =
  (mongoose.models.Medicine as Model<MedicineDoc>) ??
  mongoose.model<MedicineDoc>("Medicine", medicineSchema);
